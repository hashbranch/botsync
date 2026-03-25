/**
 * stop.ts — The `botsync stop` command.
 *
 * Stops the Syncthing daemon.
 */

import { stopDaemon } from "../syncthing.js";
import * as ui from "../ui.js";

export async function stop(): Promise<void> {
  const killed = stopDaemon();
  if (killed) {
    ui.stopped();
  } else {
    ui.notRunning();
  }
}
