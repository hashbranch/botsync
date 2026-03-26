/**
 * stop.ts — The `botsync stop` command.
 *
 * Stops the Syncthing daemon.
 */

import { stopDaemon } from "../syncthing.js";
import { stopHeartbeat } from "../heartbeat.js";
import * as ui from "../ui.js";

export async function stop(): Promise<void> {
  stopHeartbeat();
  const killed = stopDaemon();
  if (killed) {
    ui.stopped();
  } else {
    ui.notRunning();
  }
}
