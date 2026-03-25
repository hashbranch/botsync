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
  console.log(`  npx botsync join ${passphrase}`);
}
