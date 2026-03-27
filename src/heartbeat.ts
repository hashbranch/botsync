/**
 * heartbeat.ts — Spawn/stop the background heartbeat daemon.
 *
 * Instead of running in-process (which dies when init/join exits),
 * we spawn heartbeat-daemon.js as a detached child process that
 * outlives the parent CLI command.
 */

import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { BOTSYNC_DIR } from "./config.js";

const HEARTBEAT_PID_FILE = join(BOTSYNC_DIR, "heartbeat.pid");

/**
 * Spawn the heartbeat daemon as a detached background process.
 *
 * SECURITY: The network secret is passed via environment variable
 * (BOTSYNC_NETWORK_SECRET) rather than CLI argument, because CLI args
 * are visible in `ps` output. Env vars are only readable by the process
 * owner (same user) on Unix systems.
 */
export function startHeartbeat(networkSecret?: string): void {
  // Don't double-spawn
  if (isHeartbeatRunning()) return;

  const daemonScript = join(dirname(__filename), "heartbeat-daemon.js");

  // Pass secret via env to avoid exposing it in process args
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (networkSecret) {
    env.BOTSYNC_NETWORK_SECRET = networkSecret;
  }

  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: "ignore",
    env,
  });

  child.unref();
}

/** Stop the heartbeat daemon if running. */
export function stopHeartbeat(): void {
  const pid = getHeartbeatPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already dead
    }
  }
}

/** Check if the heartbeat daemon is still alive. */
export function isHeartbeatRunning(): boolean {
  const pid = getHeartbeatPid();
  if (!pid) return false;

  try {
    process.kill(pid, 0); // Signal 0 = just check if alive
    return true;
  } catch {
    return false;
  }
}

function getHeartbeatPid(): number | null {
  try {
    if (!existsSync(HEARTBEAT_PID_FILE)) return null;
    const raw = readFileSync(HEARTBEAT_PID_FILE, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}
