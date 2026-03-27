#!/usr/bin/env node
/**
 * events-daemon.ts — Standalone background events process.
 *
 * Spawned as a detached child by init/join. Long-polls the Syncthing Events
 * API for ItemFinished and DeviceConnected events, then sends batched webhook
 * notifications to OpenClaw. Exits if Syncthing dies.
 *
 * Usage: node events-daemon.js
 * (Not meant to be run directly — spawned by init/join)
 *
 * Requires OPENCLAW_HOOKS_TOKEN (or webhookToken in config.json) to be set.
 * If not configured, exits silently — notifications are opt-in.
 */

import { readConfig, BOTSYNC_DIR, SYNC_DIR, DEFAULT_WEBHOOK_URL } from "./config.js";
import { writeFileSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PID_FILE = join(BOTSYNC_DIR, "events.pid");
const DEBOUNCE_MS = 2000;
const HEALTH_CHECK_INTERVAL_MS = 120_000;

// Pending file events to batch into a single notification
let pendingFiles: Array<{ path: string; action: string; size: number }> = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Resolve webhook URL and token from env vars or config. */
function getWebhookConfig(): { url: string; token: string } | null {
  const config = readConfig();
  const token =
    process.env.OPENCLAW_HOOKS_TOKEN ||
    config?.webhookToken ||
    null;

  if (!token) return null;

  const url =
    process.env.OPENCLAW_HOOKS_URL ||
    config?.webhookUrl ||
    DEFAULT_WEBHOOK_URL;

  return { url, token };
}

/** Send a POST to the OpenClaw webhook. */
async function sendWebhook(
  url: string,
  token: string,
  body: object
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort — ignore webhook delivery failures
  }
}

/** Flush pending file events as a batched notification. */
async function flushFileEvents(): Promise<void> {
  debounceTimer = null;
  if (pendingFiles.length === 0) return;

  const webhook = getWebhookConfig();
  if (!webhook) return;

  const files = pendingFiles.splice(0);
  const home = homedir();

  const fileList = files
    .map((f) => {
      // Replace home dir with ~ for cleaner display
      const displayPath = f.path.startsWith(home)
        ? "~" + f.path.slice(home.length)
        : f.path;
      return `- **${displayPath}** (${f.action}, ${f.size} bytes)`;
    })
    .join("\n");

  const summary =
    files.length === 1
      ? "A file has been synced via BotSync:"
      : `${files.length} files have been synced via BotSync:`;

  await sendWebhook(webhook.url, webhook.token, {
    message: `${summary}\n${fileList}\n\nRead and process as appropriate.`,
    name: "BotSync",
    wakeMode: "now",
    deliver: true,
    channel: "last",
  });
}

/** Queue a file event and reset debounce timer. */
function queueFileEvent(relativePath: string, action: string): void {
  // Resolve full path and get file size
  const fullPath = join(SYNC_DIR, relativePath);
  let size = 0;
  try {
    size = statSync(fullPath).size;
  } catch {
    // File may have been deleted or not accessible
  }
  pendingFiles.push({ path: fullPath, action, size });

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(flushFileEvents, DEBOUNCE_MS);
}

/** Send a device connected notification immediately. */
async function sendDeviceConnected(
  deviceId: string,
  address: string
): Promise<void> {
  const webhook = getWebhookConfig();
  if (!webhook) return;

  await sendWebhook(webhook.url, webhook.token, {
    message: `A new device has connected to your BotSync network:\n- **Device ID:** ${deviceId}\n- **Address:** ${address}\n\nA new sync partner is now online.`,
    name: "BotSync",
    wakeMode: "now",
    deliver: true,
    channel: "last",
  });
}

/** Check if Syncthing is still alive. */
async function isSyncthingAlive(): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;

  try {
    const res = await fetch(
      `http://127.0.0.1:${config.apiPort}/rest/system/ping`,
      {
        headers: { "X-API-Key": config.apiKey },
        signal: AbortSignal.timeout(3000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Long-poll the Syncthing Events API and dispatch events. */
async function pollEvents(lastId: number): Promise<number> {
  const config = readConfig();
  if (!config) return lastId;

  try {
    const url =
      `http://127.0.0.1:${config.apiPort}/rest/events` +
      `?events=ItemFinished,DeviceConnected&since=${lastId}&timeout=55`;

    const res = await fetch(url, {
      headers: { "X-API-Key": config.apiKey },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) return lastId;

    const events = (await res.json()) as Array<{
      id: number;
      type: string;
      data: Record<string, unknown>;
    }>;

    for (const event of events) {
      if (event.type === "ItemFinished") {
        const data = event.data;
        const action = (data.action as string) || "update";
        const filePath = (data.item as string) || "";
        const fileType = (data.type as string) || "file";
        // Only notify for files, not directories
        if (filePath && fileType === "file") {
          queueFileEvent(filePath, action);
        }
      } else if (event.type === "DeviceConnected") {
        const data = event.data;
        const deviceId = (data.id as string) || "unknown";
        const address = (data.addr as string) || "unknown";
        await sendDeviceConnected(deviceId, address);
      }

      if (event.id > lastId) {
        lastId = event.id;
      }
    }
  } catch {
    // Long-poll timeout or network error — just continue
  }

  return lastId;
}

async function main(): Promise<void> {
  // Require webhook token to be configured — opt-in only
  if (!getWebhookConfig()) {
    process.exit(0);
  }

  // Write our PID so stop can kill us
  writeFileSync(PID_FILE, String(process.pid));

  // Cleanup PID file on exit
  const cleanup = () => {
    try {
      unlinkSync(PID_FILE);
    } catch {}
  };
  process.on("exit", cleanup);

  // Graceful shutdown: flush any pending file events before exiting
  // so notifications aren't lost if we're killed mid-debounce window.
  const gracefulShutdown = async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    await flushFileEvents();
    cleanup();
    process.exit(0);
  };
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);

  // Health check loop — exit if Syncthing is gone
  setInterval(async () => {
    const alive = await isSyncthingAlive();
    if (!alive) {
      cleanup();
      process.exit(0);
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // Event polling loop
  let lastId = 0;
  while (true) {
    lastId = await pollEvents(lastId);
  }
}

main().catch(() => process.exit(1));
