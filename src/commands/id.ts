/**
 * id.ts — The `botsync id` command.
 *
 * Prints this machine's full Syncthing device ID on stdout, with no
 * formatting or extra output. Pipeable to `pbcopy`, easy to paste into
 * a chat to share with a peer.
 *
 * `botsync status` truncates the device ID to 7 chars for display, which
 * is fine for a glance but useless when pairing — every Syncthing pairing
 * (botsync or vanilla) needs the full 56-char ID.
 */

import { readConfig } from "../config.js";
import { getDeviceId } from "../syncthing.js";
import * as ui from "../ui.js";

export async function id(): Promise<void> {
  const config = readConfig();
  if (!config) {
    ui.error("botsync is not initialized. Run `botsync init` first.");
    process.exit(1);
  }

  // Prefer the cached value in config.json — avoids hitting the API for
  // a value that never changes after init. Fall back to the live API in
  // case config.json predates the deviceId field.
  if (config.deviceId) {
    console.log(config.deviceId);
    return;
  }

  try {
    const live = await getDeviceId();
    console.log(live);
  } catch {
    ui.error("Could not read device ID. Is the Syncthing daemon running? Try `botsync start`.");
    process.exit(1);
  }
}
