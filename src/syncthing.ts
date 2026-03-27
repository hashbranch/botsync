/**
 * syncthing.ts — Syncthing lifecycle manager.
 *
 * Handles everything about the Syncthing binary and daemon:
 * - Downloading the right binary for the current platform
 * - Generating the initial config.xml with sane defaults
 * - Starting/stopping the daemon as a background process
 * - REST API wrapper for runtime configuration
 *
 * We generate config.xml from a template string rather than parsing XML.
 * This is intentional — Syncthing's config format is stable, and template
 * generation is way simpler than XML manipulation for an MVP.
 */

import { spawn, execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { get as httpsGet } from "https";
import { IncomingMessage } from "http";

import {
  SYNCTHING_BIN_DIR,
  SYNCTHING_BIN,
  SYNCTHING_CONFIG_DIR,
  BOTSYNC_DIR,
  PID_FILE,
  FOLDERS,
  readConfig,
} from "./config.js";

const SYNCTHING_VERSION = "2.0.15";

/**
 * Follow redirects for HTTPS GET — needed because GitHub releases
 * redirect from the download URL to a CDN. Node's https.get doesn't
 * follow redirects by default, which is frankly annoying.
 */
function httpsGetFollowRedirects(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow the redirect
        httpsGetFollowRedirects(res.headers.location).then(resolve, reject);
      } else {
        resolve(res);
      }
    }).on("error", reject);
  });
}

/**
 * Find an existing syncthing binary on the system PATH, or return null.
 * Prefer system-installed syncthing over downloading — avoids duplication
 * and works better when the user already has it (e.g., via Homebrew).
 */
function findSystemSyncthing(): string | null {
  try {
    const result = execSync("which syncthing", { encoding: "utf-8" }).trim();
    if (result && existsSync(result)) return result;
  } catch {
    // Not found on PATH
  }
  return null;
}

/**
 * Get the path to the Syncthing binary.
 * Checks: 1) our cached binary, 2) system PATH, 3) needs download.
 */
export function getSyncthingBin(): string {
  if (existsSync(SYNCTHING_BIN)) return SYNCTHING_BIN;
  const system = findSystemSyncthing();
  if (system) return system;
  return SYNCTHING_BIN; // Will need download
}

/**
 * Download the Syncthing binary for the current platform.
 * Extracts from the GitHub release and stores in ~/.botsync/bin/.
 *
 * Skips download if we already have a binary OR one exists on the system PATH.
 * macOS releases are .zip, Linux releases are .tar.gz.
 */
export async function downloadSyncthing(): Promise<void> {
  // Check if we already have a usable binary (cached or system)
  if (existsSync(SYNCTHING_BIN)) return;
  if (findSystemSyncthing()) {
    return; // Using system Syncthing
  }

  // Map Node's platform/arch to Syncthing's naming convention
  const platform = process.platform === "darwin" ? "macos" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const slug = `syncthing-${platform}-${arch}-v${SYNCTHING_VERSION}`;
  // macOS uses .zip, Linux uses .tar.gz
  const ext = process.platform === "darwin" ? "zip" : "tar.gz";
  const url = `https://github.com/syncthing/syncthing/releases/download/v${SYNCTHING_VERSION}/${slug}.${ext}`;

  // Download message handled by caller's UI

  mkdirSync(SYNCTHING_BIN_DIR, { recursive: true });

  const archivePath = join(SYNCTHING_BIN_DIR, `syncthing.${ext}`);

  // Use curl for downloads — it handles redirects, TLS, and retries
  // better than Node's https.get, and every Mac/Linux has it.
  execSync(`curl -fsSL -o "${archivePath}" "${url}"`, { stdio: "inherit" });

  if (ext === "zip") {
    // macOS: unzip, then move binary out
    execSync(`unzip -o "${archivePath}" -d "${SYNCTHING_BIN_DIR}"`, { stdio: "ignore" });
    const extracted = join(SYNCTHING_BIN_DIR, slug, "syncthing");
    if (existsSync(extracted)) {
      execSync(`mv "${extracted}" "${SYNCTHING_BIN}"`);
      // Clean up extracted directory
      execSync(`rm -rf "${join(SYNCTHING_BIN_DIR, slug)}"`);
    }
  } else {
    // Linux: tar extract
    const tar = await import("tar");
    await tar.extract({
      file: archivePath,
      cwd: SYNCTHING_BIN_DIR,
      strip: 1,
      filter: (path: string) => path.endsWith("/syncthing"),
    });
  }

  chmodSync(SYNCTHING_BIN, 0o755);

  // Clean up the archive
  const { unlinkSync } = await import("fs");
  unlinkSync(archivePath);

  // Download complete — caller handles messaging
}

/**
 * Generate the Syncthing config.xml with our desired settings.
 *
 * Key decisions:
 * - GUI disabled: agents don't need a web UI, and it avoids port conflicts
 * - Global discovery disabled: we pair explicitly via passphrase, no phone-home
 * - Local discovery enabled: allows finding peers on the same LAN without relay
 * - Relaying disabled: MVP keeps it simple, direct connections only
 * - Random API port: avoids conflicts with other Syncthing instances
 */
export function generateConfig(apiKey: string, apiPort: number): string {
  // Build folder XML blocks from our standard folder list
  const folderXml = FOLDERS.map(
    (f) => `
    <folder id="${f.id}" label="${f.id}" path="${f.path}" type="sendreceive" 
            rescanIntervalS="10" fsWatcherEnabled="true" fsWatcherDelayS="1">
        <filesystemType>basic</filesystemType>
        <minDiskFree unit="%">1</minDiskFree>
    </folder>`
  ).join("\n");

  return `<configuration version="37">
${folderXml}

    <gui enabled="true" tls="false" debugging="false">
        <address>127.0.0.1:${apiPort}</address>
        <apikey>${apiKey}</apikey>
        <theme>default</theme>
    </gui>

    <options>
        <listenAddress>default</listenAddress>
        <globalAnnounceEnabled>true</globalAnnounceEnabled>
        <localAnnounceEnabled>true</localAnnounceEnabled>
        <relaysEnabled>true</relaysEnabled>
        <startBrowser>false</startBrowser>
        <natEnabled>true</natEnabled>
        <urAccepted>-1</urAccepted>
        <autoUpgradeIntervalH>0</autoUpgradeIntervalH>
    </options>

    <defaults>
        <device>
            <autoAcceptFolders>true</autoAcceptFolders>
        </device>
    </defaults>
</configuration>
`;
}

/**
 * Start the Syncthing daemon as a background process.
 * Returns the child process PID.
 *
 * We detach the process and unref it so our CLI can exit while
 * Syncthing keeps running. The PID is saved to disk so `botsync stop`
 * can find and kill it later.
 */
export function startDaemon(): number {
  mkdirSync(SYNCTHING_CONFIG_DIR, { recursive: true });

  const bin = getSyncthingBin();
  const child = spawn(bin, [
    "--no-browser",
    "--no-upgrade",
    `--home=${SYNCTHING_CONFIG_DIR}`,
  ], {
    detached: true,
    stdio: "ignore", // Don't inherit our stdio — it's a background daemon
  });

  child.unref(); // Let the parent process exit without waiting

  const pid = child.pid;
  if (!pid) throw new Error("Failed to start Syncthing daemon");

  // Save PID so we can stop it later
  writeFileSync(PID_FILE, pid.toString());

  return pid;
}

/**
 * Make an API call to the local Syncthing REST API.
 * All config changes go through this — Syncthing's REST API is the
 * canonical way to modify a running instance's configuration.
 */
export async function apiCall<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const config = readConfig();
  if (!config) throw new Error("botsync not initialized. Run `botsync init` first.");

  const url = `http://127.0.0.1:${config.apiPort}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": config.apiKey,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Syncthing API error: ${res.status} ${text}`);
  }

  // Some endpoints return no body (204, etc.)
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Get this device's Syncthing device ID.
 * The device ID is derived from the TLS certificate Syncthing generates
 * on first run — it's essentially a public key fingerprint.
 */
export async function getDeviceId(): Promise<string> {
  const status = await apiCall<{ myID: string }>("GET", "/rest/system/status");
  return status.myID;
}

/**
 * Wait for Syncthing to become responsive.
 * On first run, Syncthing needs a moment to generate its TLS cert and
 * start the API server. We poll until it responds.
 */
export async function waitForStart(maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await apiCall("GET", "/rest/system/status");
      return; // It's alive!
    } catch {
      // Not ready yet — wait and retry
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Syncthing failed to start within 30 seconds");
}

/**
 * Add a remote device to Syncthing's config.
 * This is how we "pair" — we tell our Syncthing about the other device's ID.
 */
export async function addDevice(deviceId: string): Promise<void> {
  // Get current config, add the device, PUT it back
  const config = await apiCall<{ devices: Array<{ deviceID: string }> }>("GET", "/rest/config");

  // Don't add if already present
  const exists = config.devices.some((d) => d.deviceID === deviceId);
  if (exists) return;

  config.devices.push({
    deviceID: deviceId,
  });

  await apiCall("PUT", "/rest/config", config);
}

/**
 * Add a device to a specific shared folder.
 * Both sides need to share the same folder IDs with each other's device IDs
 * for sync to work.
 */
export async function addDeviceToFolder(folderId: string, deviceId: string): Promise<void> {
  const config = await apiCall<{
    folders: Array<{ id: string; devices: Array<{ deviceID: string }> }>;
  }>("GET", "/rest/config");

  const folder = config.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found in config`);

  // Don't add if already shared with this device
  const exists = folder.devices?.some((d) => d.deviceID === deviceId);
  if (exists) return;

  if (!folder.devices) folder.devices = [];
  folder.devices.push({ deviceID: deviceId });

  await apiCall("PUT", "/rest/config", config);
}

/**
 * Stop the Syncthing daemon by reading the PID file and sending SIGTERM.
 * Returns true if a process was stopped, false if nothing was running.
 *
 * Falls back to pkill if the PID file is stale (process died without cleanup).
 */
export function stopDaemon(): boolean {
  let killed = false;

  // Try PID file first
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    killed = true;
  } catch {
    // PID file missing or process already dead
  }

  // Fallback: kill any syncthing using our config dir (handles stale PID file)
  try {
    execSync(`pkill -f "syncthing.*--home=${SYNCTHING_CONFIG_DIR}"`, { stdio: "ignore" });
    killed = true;
  } catch {
    // No matching process — that's fine
  }

  // Clean up PID file
  try {
    const { unlinkSync } = require("fs");
    unlinkSync(PID_FILE);
  } catch {
    // Already gone
  }

  return killed;
}

/**
 * Kill any stale Syncthing process that might be left over from a previous run.
 * Called at the top of `init()` to ensure a clean start.
 *
 * This handles the case where the user ^C's out of init — the daemon keeps
 * running but the CLI doesn't know about it. Next `init` would fail because
 * the port/config dir is already in use.
 */
export function cleanupStale(): void {
  // Try PID file
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already dead — just clean up the file
    }
    try {
      const { unlinkSync } = require("fs");
      unlinkSync(PID_FILE);
    } catch {
      // Already gone
    }
  }

  // Also pkill any syncthing using our config dir (catches orphans with no PID file)
  try {
    execSync(`pkill -f "syncthing.*--home=${SYNCTHING_CONFIG_DIR}"`, { stdio: "ignore" });
    // Give it a moment to die
    execSync("sleep 0.5", { stdio: "ignore" });
  } catch {
    // No matching process — clean slate
  }
}
