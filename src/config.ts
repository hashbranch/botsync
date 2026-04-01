/**
 * config.ts — Central configuration and path management for botsync.
 *
 * All paths are derived from the user's home directory. The sync root is ~/sync/,
 * and botsync's internal state lives in ~/sync/.botsync/. We also store the
 * syncthing binary in ~/.botsync/bin/ (outside the sync dir so it doesn't get synced).
 *
 * config.json is the runtime state file — it stores the API key, port, device ID,
 * and PID so that all commands can talk to the running Syncthing instance.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// BOTSYNC_ROOT env var overrides the default ~/sync/ location.
// Useful for testing without touching a production sync folder.
const root = process.env.BOTSYNC_ROOT || join(homedir(), "sync");

// Where synced files live — the user-facing directory
export const SYNC_DIR = root;

// Internal botsync state — inside sync dir but gitignored by Syncthing
export const BOTSYNC_DIR = join(SYNC_DIR, ".botsync");

// Syncthing config/data lives here (inside .botsync so it's co-located)
export const SYNCTHING_CONFIG_DIR = join(BOTSYNC_DIR, "syncthing");

// Where we store the syncthing binary — outside sync dir to avoid syncing a binary
export const SYNCTHING_BIN_DIR = join(homedir(), ".botsync", "bin");
export const SYNCTHING_BIN = join(SYNCTHING_BIN_DIR, "syncthing");

// Runtime config file — API key, port, device ID, PID
export const CONFIG_FILE = join(BOTSYNC_DIR, "config.json");

// PID file for the daemon
export const PID_FILE = join(BOTSYNC_DIR, "daemon.pid");

// Sync folders — just shared/ by default. Users can organize within it.
export const FOLDERS = [
  { id: "botsync-shared", path: join(SYNC_DIR, "shared") },
];

// Manifest file — tells agents what this folder is and how to use it
export const MANIFEST_FILE = join(SYNC_DIR, "BOTSYNC.md");

// Network identity file — stores the network ID for dashboard visibility
export const NETWORK_FILE = join(BOTSYNC_DIR, "network.json");

// PID file for the events daemon
export const EVENTS_PID_FILE = join(BOTSYNC_DIR, "events.pid");

// Default OpenClaw webhook URL
export const DEFAULT_WEBHOOK_URL = "http://127.0.0.1:18789/hooks/agent";

/** Runtime config shape — everything we need to talk to Syncthing */
export interface BotsyncConfig {
  apiKey: string;
  apiPort: number;
  deviceId?: string;
  webhookUrl?: string;   // OpenClaw hooks URL (default: http://127.0.0.1:18789/hooks/agent)
  webhookToken?: string; // OpenClaw hooks bearer token
}

/**
 * Persist webhook config from env vars (OPENCLAW_HOOKS_TOKEN, OPENCLAW_HOOKS_URL)
 * into config.json if present and changed. This allows subsequent `botsync start`
 * calls to pick up webhook config without requiring env vars to be set again.
 *
 * No-op if OPENCLAW_HOOKS_TOKEN is not set or config.json doesn't exist.
 */
export function persistWebhookConfig(): void {
  const token = process.env.OPENCLAW_HOOKS_TOKEN;
  const url = process.env.OPENCLAW_HOOKS_URL;
  if (!token) return;

  const config = readConfig();
  if (!config) return;

  if (token !== config.webhookToken || (url && url !== config.webhookUrl)) {
    writeConfig({
      ...config,
      webhookToken: token,
      ...(url && { webhookUrl: url }),
    });
  }
}

/** Read the config file, or return null if it doesn't exist */
export function readConfig(): BotsyncConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as BotsyncConfig;
  } catch {
    return null;
  }
}

/**
 * Write config to disk. Creates parent dirs if needed.
 * SECURITY: File permissions set to 0o600 (owner read/write only)
 * because config.json contains the Syncthing API key.
 */
export function writeConfig(config: BotsyncConfig): void {
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_FILE, 0o600);
}

/** Read the network ID, or return null if not yet assigned */
export function readNetworkId(): string | null {
  const data = readNetworkFile();
  return data?.networkId || null;
}

/**
 * Write the network ID to disk.
 * SECURITY: File permissions set to 0o600 because network.json
 * also stores the networkSecret (added in v0.3.0).
 */
export function writeNetworkId(networkId: string): void {
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  // Preserve existing secret if present
  const existing = readNetworkFile();
  const data = { ...existing, networkId };
  writeFileSync(NETWORK_FILE, JSON.stringify(data, null, 2));
  chmodSync(NETWORK_FILE, 0o600);
}

/**
 * Write the network secret to disk alongside the network ID.
 * SECURITY: This is the bearer token used to authenticate with the relay.
 * File permissions are 0o600 (owner only). Never log or display this value.
 */
export function writeNetworkSecret(secret: string): void {
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  const existing = readNetworkFile();
  const data = { ...existing, networkSecret: secret };
  writeFileSync(NETWORK_FILE, JSON.stringify(data, null, 2));
  chmodSync(NETWORK_FILE, 0o600);
}

/**
 * Read the network secret, or return null if not set.
 * Returns null for pre-v0.3.0 networks that don't have a secret.
 */
export function readNetworkSecret(): string | null {
  const data = readNetworkFile();
  return data?.networkSecret || null;
}

/** Internal: read the raw network.json file */
function readNetworkFile(): { networkId?: string; networkSecret?: string } | null {
  try {
    const raw = readFileSync(NETWORK_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
