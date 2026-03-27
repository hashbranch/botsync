/**
 * invite.ts — The `botsync invite` command.
 *
 * Generates a new pairing code for an already-initialized botsync instance.
 * This lets you add more machines without reinitializing.
 *
 * Unlike `init`, invite:
 * 1. Requires botsync to already be set up (config.json + running daemon)
 * 2. Reads the existing device ID from config
 * 3. Registers a new code on the relay (or falls back to base58)
 * 4. Waits for the joining peer and auto-accepts it
 *
 * The joining side uses `botsync join <code>` — same as with init.
 */

import { readConfig, readNetworkId, FOLDERS } from "../config.js";
import { createCode } from "../passphrase.js";
import { apiCall, addDevice, addDeviceToFolder } from "../syncthing.js";
import * as ui from "../ui.js";

export async function invite(): Promise<void> {
  ui.header();

  // Must be initialized
  const config = readConfig();
  if (!config?.deviceId) {
    ui.error("botsync is not initialized. Run `botsync init` first.");
    process.exit(1);
  }

  // Daemon must be running
  try {
    await apiCall("GET", "/rest/system/status");
  } catch {
    ui.error("Syncthing daemon is not running. Run `botsync init` or `botsync start` first.");
    process.exit(1);
  }

  ui.stepDone("Daemon running");

  // Generate a new pairing code with our existing device ID
  const networkId = readNetworkId() || undefined;
  const { code, isRelay } = await createCode({
    deviceId: config.deviceId,
    folders: FOLDERS.map((f) => f.id),
    networkId,
  });

  ui.gap();
  if (isRelay) {
    ui.passphraseBox(code, `npx botsync join ${code}`);
    ui.info("Code expires in 10 minutes.");
  } else {
    ui.info("Relay unavailable — using offline passphrase:");
    ui.gap();
    ui.passphraseBox(code, `npx botsync join ${code.substring(0, 20)}...`);
  }

  if (networkId) {
    ui.gap();
    ui.info(`Dashboard: https://botsync.io/dashboard#${networkId}`);
  }
  ui.gap();

  // Wait for the joining device to connect and auto-accept it
  const peerSpin = ui.spinner("Waiting for peer...");
  const accepted = await waitForNewPeer(peerSpin);
  if (accepted) {
    peerSpin.stop();
    ui.paired(accepted);
  }
}

/**
 * Poll for pending device connections and auto-accept the first new one.
 * Same logic as init's waitForPeer, but factored out to be reusable.
 *
 * Times out after 10 minutes (matching the relay code TTL).
 */
async function waitForNewPeer(spin: any, timeoutMs = 600_000): Promise<string | null> {
  // Snapshot the current set of known devices so we only accept new ones
  const knownDevices = await getKnownDeviceIds();
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      const pending = await apiCall<Record<string, unknown>>("GET", "/rest/cluster/pending/devices");
      const deviceIds = Object.keys(pending);

      // Accept the first pending device we haven't seen before
      for (const peerId of deviceIds) {
        if (knownDevices.has(peerId)) continue;

        spin.text = `Accepting ${peerId.substring(0, 7)}...`;

        // Add the device to our config
        await addDevice(peerId);

        // Share all folders with it
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
  ui.info("No peer connected within 10 minutes.");
  ui.info("Generate a new code with `botsync invite`.");
  ui.gap();
  return null;
}

/**
 * Get the set of device IDs already known to Syncthing.
 * Used to distinguish genuinely new peers from ones we already have.
 */
async function getKnownDeviceIds(): Promise<Set<string>> {
  try {
    const config = await apiCall<{ devices: Array<{ deviceID: string }> }>("GET", "/rest/config");
    return new Set(config.devices.map((d) => d.deviceID));
  } catch {
    return new Set();
  }
}
