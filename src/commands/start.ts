/**
 * start.ts — The `botsync start` command.
 *
 * Restarts the Syncthing daemon + heartbeat + events without reinitializing.
 * Use after a reboot or after `botsync stop`.
 *
 * Requires botsync to already be initialized (config.json must exist).
 */

import { readConfig, readNetworkSecret } from "../config.js";
import { startDaemon, waitForStart, cleanupStale, removeDeprecatedFolders } from "../syncthing.js";
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
    const res = await fetch(`http://127.0.0.1:${config.apiPort}/rest/system/ping`, {
      headers: { "X-API-Key": config.apiKey },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`ping failed: ${res.statusText}`);
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

  // Clean up deprecated folders from pre-v0.5.0 installs
  await removeDeprecatedFolders();

  // Restart background daemons
  const secret = readNetworkSecret();
  if (secret) {
    startHeartbeat(secret);
    ui.stepDone("Heartbeat running");
  }

  if (config.webhookToken || process.env.OPENCLAW_HOOKS_TOKEN) {
    startEvents();
    ui.stepDone("Events running");
  }

  ui.stepDone("Ready");
}
