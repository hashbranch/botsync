/**
 * stop.ts — The `botsync stop` command.
 *
 * Cleanly shuts down the Syncthing daemon by sending SIGTERM to the
 * stored PID. Simple and reliable — Syncthing handles SIGTERM gracefully,
 * flushing any pending writes before exiting.
 */

import { stopDaemon } from "../syncthing.js";

export async function stop(): Promise<void> {
  const stopped = stopDaemon();

  if (stopped) {
    console.log("botsync stopped.");
  } else {
    console.log("botsync is not running.");
  }
}
