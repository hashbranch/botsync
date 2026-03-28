/**
 * start.ts — The `botsync start` command.
 *
 * Restarts the Syncthing daemon + heartbeat + events without reinitializing.
 * Use after a reboot or after `botsync stop`.
 *
 * Requires botsync to already be initialized (config.json must exist).
 */

import { readConfig, readNetworkSecret } from "../config.js";
import { startDaemon, waitForStart, cleanupStale } from "../syncthing.js";
import { startHeartbeat } from "../heartbeat.js";
import { startEvents } from "../events.js";
import * as ui from "../ui.js";

export async function start(): Promise<void> {
  ui.header();

  const config = readConfig();
  if (!config) {
    ui.error("botsync is not initialized. Run `botsync init` first.");
    process.exit(1);
  }

  // Check if already running
  try {
    await fetch(`http://127.0.0.1:${config.apiPort}/rest/system/ping`, {
      headers: { "X-API-Key": config.apiKey },
      signal: AbortSignal.timeout(2000),
    });
    ui.stepDone("Daemon already running");
  } catch {
    // Not running — start it
    cleanupStale();
    const pid = startDaemon();
    ui.stepDone(`Daemon started (PID ${pid})`);

    const spin = ui.spinner("Waiting for Syncthing...");
    await waitForStart();
    spin.succeed();
  }

  // Restart background daemons
  const secret = readNetworkSecret();
  if (secret) {
    startHeartbeat(secret);
    ui.stepDone("Heartbeat running");
  }

  startEvents();
  ui.stepDone("Ready");
}
