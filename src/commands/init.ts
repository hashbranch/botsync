/**
 * init.ts — The `botsync init` command.
 *
 * This is the "machine A" side of the pairing flow. It:
 * 1. Creates the ~/sync/ directory structure
 * 2. Downloads Syncthing if needed
 * 3. Generates config with sane defaults
 * 4. Starts the daemon
 * 5. Waits for it to come online
 * 6. Produces a passphrase that encodes everything "machine B" needs to connect
 * 7. Polls for the joining device and auto-accepts it
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";

import {
  SYNC_DIR,
  BOTSYNC_DIR,
  SYNCTHING_CONFIG_DIR,
  FOLDERS,
  writeConfig,
} from "../config.js";

import {
  downloadSyncthing,
  generateConfig,
  startDaemon,
  waitForStart,
  getDeviceId,
  apiCall,
  addDevice,
  addDeviceToFolder,
} from "../syncthing.js";

import { encode } from "../passphrase.js";
import * as ui from "../ui.js";

/**
 * Pick a random port in the ephemeral range for the Syncthing REST API.
 * We avoid 8384 (Syncthing's default) to not conflict with any existing
 * Syncthing installation the user might have.
 */
function randomPort(): number {
  return 27000 + Math.floor(Math.random() * 10000);
}

export async function init(): Promise<void> {
  ui.header();

  // Step 1: Create directory structure
  for (const folder of FOLDERS) {
    mkdirSync(folder.path, { recursive: true });
  }
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  mkdirSync(SYNCTHING_CONFIG_DIR, { recursive: true });
  ui.stepDone("Sync folders created");

  // Step 2: Download Syncthing binary (skips if already present)
  await downloadSyncthing();
  ui.stepDone("Syncthing ready");

  // Step 3: Generate config
  const apiKey = randomUUID();
  const apiPort = randomPort();

  const configXml = generateConfig(apiKey, apiPort);
  writeFileSync(`${SYNCTHING_CONFIG_DIR}/config.xml`, configXml);
  writeConfig({ apiKey, apiPort });

  // Step 4: Start the daemon
  const pid = startDaemon();
  ui.stepDone(`Daemon started (PID ${pid})`);

  // Step 5: Wait for Syncthing to be ready and get our device ID
  const spin = ui.spinner("Starting Syncthing...");
  await waitForStart();
  spin.succeed();

  const deviceId = await getDeviceId();
  writeConfig({ apiKey, apiPort, deviceId });

  // Step 6: Display the passphrase
  ui.gap();
  const passphrase = encode({
    deviceId,
    folders: FOLDERS.map((f) => f.id),
  });
  ui.passphraseBox(passphrase, `npx botsync join ${passphrase.substring(0, 20)}...`);
  ui.gap();

  // Step 7: Wait for the joining device to connect and auto-accept it
  const peerSpin = ui.spinner("Waiting for peer...");
  const accepted = await waitForPeer(apiKey, apiPort, peerSpin);
  if (accepted) {
    peerSpin.stop();
    ui.paired(accepted);
  }
}

/**
 * Poll for pending device connections and auto-accept the first one.
 * After accepting the device, share all botsync folders with it.
 *
 * Times out after 5 minutes — if nobody joins by then, they can still
 * join later (they'll just show up as pending until the user restarts
 * init or manually approves via the API).
 */
async function waitForPeer(apiKey: string, apiPort: number, spin: any, timeoutMs = 300_000): Promise<string | null> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      const pending = await apiCall<Record<string, unknown>>("GET", "/rest/cluster/pending/devices");
      const deviceIds = Object.keys(pending);

      if (deviceIds.length > 0) {
        const peerId = deviceIds[0];
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
  ui.info("No peer connected within 5 minutes.");
  ui.info("The passphrase is still valid — join anytime, then restart init.");
  ui.gap();
  return null;
}
