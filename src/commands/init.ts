/**
 * init.ts — The `botsync init` command.
 *
 * This is the "machine A" side of the pairing flow. It:
 * 1. Creates the ~/sync/ directory structure
 * 2. Downloads Syncthing if needed
 * 3. Generates config with sane defaults (no GUI, local discovery only)
 * 4. Starts the daemon
 * 5. Waits for it to come online
 * 6. Produces a passphrase that encodes everything "machine B" needs to connect
 *
 * The passphrase is the entire output of this command — copy it, send it
 * to the other machine, done.
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

/**
 * Pick a random port in the ephemeral range for the Syncthing REST API.
 * We avoid 8384 (Syncthing's default) to not conflict with any existing
 * Syncthing installation the user might have.
 */
function randomPort(): number {
  return 27000 + Math.floor(Math.random() * 10000);
}

export async function init(): Promise<void> {
  // Step 1: Create directory structure
  // These are the user-facing folders that will be synced
  console.log("Creating sync folders...");
  for (const folder of FOLDERS) {
    mkdirSync(folder.path, { recursive: true });
  }
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  mkdirSync(SYNCTHING_CONFIG_DIR, { recursive: true });

  // Step 2: Download Syncthing binary (skips if already present)
  await downloadSyncthing();

  // Step 3: Generate config
  // API key is a random UUID — used to authenticate REST API calls.
  // API port is random to avoid conflicts.
  const apiKey = randomUUID();
  const apiPort = randomPort();

  const configXml = generateConfig(apiKey, apiPort);
  writeFileSync(
    `${SYNCTHING_CONFIG_DIR}/config.xml`,
    configXml
  );

  // Save our config so other commands can find the API
  writeConfig({ apiKey, apiPort });

  // Step 4: Start the daemon
  console.log("Starting Syncthing daemon...");
  const pid = startDaemon();
  console.log(`Daemon started (PID: ${pid})`);

  // Step 5: Wait for Syncthing to be ready and get our device ID
  console.log("Waiting for Syncthing to start...");
  await waitForStart();

  const deviceId = await getDeviceId();
  writeConfig({ apiKey, apiPort, deviceId });

  // Step 6: Generate and display the passphrase
  const passphrase = encode({
    deviceId,
    folders: FOLDERS.map((f) => f.id),
  });

  console.log(`\nbotsync ready! Share this passphrase to connect:\n`);
  console.log(`  ${passphrase}\n`);
  console.log(`On the other machine, run:`);
  console.log(`  npx botsync join ${passphrase}\n`);

  // Step 7: Wait for the joining device to connect and auto-accept it.
  // Syncthing puts unknown devices in a "pending" queue. We poll for it
  // and approve the first one — this completes the bidirectional pairing
  // without the joiner needing to manually add our device ID.
  console.log(`Waiting for peer to connect...`);
  const accepted = await waitForPeer(apiKey, apiPort);
  if (accepted) {
    console.log(`\n✅ Paired with ${accepted.substring(0, 7)}! Sync is active.`);
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
async function waitForPeer(apiKey: string, apiPort: number, timeoutMs = 300_000): Promise<string | null> {
  const start = Date.now();
  const pollInterval = 2000; // Check every 2 seconds

  while (Date.now() - start < timeoutMs) {
    try {
      const pending = await apiCall<Record<string, unknown>>("GET", "/rest/cluster/pending/devices");
      const deviceIds = Object.keys(pending);

      if (deviceIds.length > 0) {
        const peerId = deviceIds[0];
        console.log(`\nDevice ${peerId.substring(0, 7)}... wants to connect — accepting...`);

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

  console.log(`\nNo peer connected within ${timeoutMs / 60000} minutes.`);
  console.log(`The passphrase is still valid — run 'botsync join' on the other machine anytime.`);
  console.log(`Then restart botsync here to complete pairing.`);
  return null;
}
