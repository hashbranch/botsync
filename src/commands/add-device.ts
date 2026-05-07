/**
 * add-device.ts — The `botsync add-device <deviceId>` command.
 *
 * Manually adds a remote device to Syncthing's config and shares the
 * default folder with it. Two scenarios this exists for:
 *
 * 1. Recovery: `botsync init` was re-run by accident, wiping the local
 *    peer list. The TLS cert is unchanged so peers still trust this
 *    machine — you just need to re-add them on this side.
 *
 * 2. Stock-Syncthing interop: pair with a peer that doesn't run botsync.
 *    They give you their device ID, you `add-device` it; once they add
 *    yours back via their Syncthing GUI the connection comes up.
 *
 * No relay, no passphrase. Just a device ID + folder share.
 */

import { FOLDERS, readConfig } from "../config.js";
import { addDevice, addDeviceToFolder, apiCall } from "../syncthing.js";
import * as ui from "../ui.js";

// Syncthing device IDs are 8 groups of 7 base32 chars separated by hyphens.
// Example: GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX
const DEVICE_ID_PATTERN = /^[A-Z0-9]{7}(?:-[A-Z0-9]{7}){7}$/;

export async function addDeviceCmd(rawDeviceId: string): Promise<void> {
  ui.header();

  if (!readConfig()) {
    ui.error("botsync is not initialized. Run `botsync init` first.");
    process.exit(1);
  }

  // Normalize: device IDs are case-insensitive in Syncthing's UI but the
  // API stores them uppercase. Trim whitespace from copy-paste.
  const deviceId = rawDeviceId.trim().toUpperCase();
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    ui.error("Invalid device ID.");
    ui.info("Expected 8 groups of 7 base32 chars separated by hyphens.");
    ui.info("Example: GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX");
    ui.info("Get a peer's ID with `botsync id` on their machine.");
    process.exit(1);
  }

  try {
    await apiCall("GET", "/rest/system/ping");
  } catch {
    ui.error("Syncthing daemon is not running. Run `botsync start` first.");
    process.exit(1);
  }

  const spin = ui.spinner(`Adding ${deviceId.substring(0, 7)}...`);
  await addDevice(deviceId);
  for (const folder of FOLDERS) {
    await addDeviceToFolder(folder.id, deviceId);
  }
  spin.stop();

  ui.connected(deviceId);
  ui.info("Sync will start once their Syncthing reaches yours.");
  ui.gap();
}
