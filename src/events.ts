/**
 * events.ts — Spawn/stop the background events daemon.
 *
 * Instead of running in-process (which dies when init/join exits),
 * we spawn events-daemon.js as a detached child process that
 * outlives the parent CLI command.
 *
 * Only starts if OpenClaw webhook config is present (opt-in).
 */

import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { EVENTS_PID_FILE } from "./config.js";

/** Spawn the events daemon as a detached background process. */
export function startEvents(): void {
  // Don't double-spawn
  if (isEventsRunning()) return;

  const daemonScript = join(dirname(__filename), "events-daemon.js");

  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

/** Stop the events daemon if running. */
export function stopEvents(): void {
  const pid = getEventsPid();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already dead
    }
  }
}

/** Check if the events daemon is still alive. */
export function isEventsRunning(): boolean {
  const pid = getEventsPid();
  if (!pid) return false;

  try {
    process.kill(pid, 0); // Signal 0 = just check if alive
    return true;
  } catch {
    return false;
  }
}

function getEventsPid(): number | null {
  try {
    if (!existsSync(EVENTS_PID_FILE)) return null;
    const raw = readFileSync(EVENTS_PID_FILE, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}
