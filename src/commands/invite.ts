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

import { readConfig, readNetworkId, readNetworkSecret, FOLDERS } from "../config.js";
import { createCode } from "../passphrase.js";
import { apiCall } from "../syncthing.js";
import { waitForNewPeer } from "../peer-discovery.js";
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

  // Generate a new pairing code with our existing device ID + network secret
  const networkId = readNetworkId() || undefined;
  const networkSecret = readNetworkSecret() || undefined;
  const { code, isRelay } = await createCode({
    deviceId: config.deviceId,
    folders: FOLDERS.map((f) => f.id),
    networkId,
    networkSecret,
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
  const accepted = await waitForNewPeer(peerSpin, 600_000);
  if (accepted) {
    peerSpin.stop();
    ui.paired(accepted);
  }
}
