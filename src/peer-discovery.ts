/**
 * peer-discovery.ts — Shared peer discovery and auto-accept logic.
 *
 * Used by both `init` and `invite` to poll for pending device connections
 * and auto-accept them into the Syncthing config.
 */

import { Ora } from "ora";
import { FOLDERS } from "./config.js";
import { apiCall, addDevice, addDeviceToFolder } from "./syncthing.js";
import * as ui from "./ui.js";

/**
 * Get the set of device IDs already known to Syncthing.
 * Used to distinguish genuinely new peers from ones we already have.
 */
export async function getKnownDeviceIds(): Promise<Set<string>> {
  try {
    const config = await apiCall<{ devices: Array<{ deviceID: string }> }>("GET", "/rest/config");
    return new Set(config.devices.map((d) => d.deviceID));
  } catch {
    return new Set();
  }
}

/**
 * Poll for pending device connections and auto-accept the first new one.
 * After accepting the device, shares all botsync folders with it.
 *
 * Snapshots currently known devices before polling, so only genuinely
 * new peers are accepted (important for `invite` where peers already exist).
 *
 * @param spin - Ora spinner to update with progress text
 * @param timeoutMs - How long to wait before giving up (default: 5 min)
 * @returns The accepted device ID, or null on timeout
 */
export async function waitForNewPeer(spin: Ora, timeoutMs = 300_000): Promise<string | null> {
  const knownDevices = await getKnownDeviceIds();
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      const pending = await apiCall<Record<string, unknown>>("GET", "/rest/cluster/pending/devices");
      const deviceIds = Object.keys(pending);

      for (const peerId of deviceIds) {
        if (knownDevices.has(peerId)) continue;

        spin.text = `Accepting ${peerId.substring(0, 7)}...`;

        await addDevice(peerId);

        for (const folder of FOLDERS) {
          await addDeviceToFolder(folder.id, peerId);
        }

        return peerId;
      }
    } catch {
      // API might hiccup during config changes — ignore and retry
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  spin.stop();
  ui.info("No peer connected. The code may still be valid — try again.");
  ui.gap();
  return null;
}
