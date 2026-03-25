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

import { readFileSync, writeFileSync, mkdirSync } from "fs";
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

// The three standard sync folders
export const FOLDERS = [
  { id: "botsync-shared", path: join(SYNC_DIR, "shared") },
  { id: "botsync-deliverables", path: join(SYNC_DIR, "deliverables") },
  { id: "botsync-inbox", path: join(SYNC_DIR, "inbox") },
];

// Network identity file — stores the network ID for dashboard visibility
export const NETWORK_FILE = join(BOTSYNC_DIR, "network.json");

/** Runtime config shape — everything we need to talk to Syncthing */
export interface BotsyncConfig {
  apiKey: string;
  apiPort: number;
  deviceId?: string;
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

/** Write config to disk. Creates parent dirs if needed. */
export function writeConfig(config: BotsyncConfig): void {
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** Read the network ID, or return null if not yet assigned */
export function readNetworkId(): string | null {
  try {
    const raw = readFileSync(NETWORK_FILE, "utf-8");
    const data = JSON.parse(raw) as { networkId: string };
    return data.networkId || null;
  } catch {
    return null;
  }
}

/** Write the network ID to disk. */
export function writeNetworkId(networkId: string): void {
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  writeFileSync(NETWORK_FILE, JSON.stringify({ networkId }, null, 2));
}
