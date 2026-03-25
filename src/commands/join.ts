/**
 * join.ts — The `botsync join <passphrase>` command.
 *
 * This is the "machine B" side of the pairing flow. It:
 * 1. Decodes the passphrase to get the remote device ID and folder list
 * 2. Initializes locally if not already done (same as init, minus passphrase output)
 * 3. Adds the remote device to our Syncthing config
 * 4. Shares all folders with the remote device
 *
 * After this, Syncthing handles everything — discovery, NAT traversal,
 * conflict resolution, etc. We just connected two nodes.
 */

import { existsSync } from "fs";

import { BOTSYNC_DIR, CONFIG_FILE, FOLDERS, readConfig, writeConfig, SYNCTHING_CONFIG_DIR } from "../config.js";
import { decode } from "../passphrase.js";
import {
  downloadSyncthing,
  generateConfig,
  startDaemon,
  waitForStart,
  getDeviceId,
  addDevice,
  addDeviceToFolder,
} from "../syncthing.js";
import { mkdirSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

export async function join(passphrase: string): Promise<void> {
  // Step 1: Decode the passphrase
  const remote = decode(passphrase);
  console.log(`Connecting to device ${remote.deviceId.substring(0, 7)}...`);

  // Step 2: Initialize if not already done
  // We check for the config file as a proxy for "has init been run"
  let config = readConfig();
  if (!config) {
    console.log("First time setup — initializing botsync...");

    // Create directories
    for (const folder of FOLDERS) {
      mkdirSync(folder.path, { recursive: true });
    }
    mkdirSync(BOTSYNC_DIR, { recursive: true });
    mkdirSync(SYNCTHING_CONFIG_DIR, { recursive: true });

    await downloadSyncthing();

    const apiKey = randomUUID();
    const apiPort = 27000 + Math.floor(Math.random() * 10000);

    const configXml = generateConfig(apiKey, apiPort);
    writeFileSync(`${SYNCTHING_CONFIG_DIR}/config.xml`, configXml);
    writeConfig({ apiKey, apiPort });

    console.log("Starting Syncthing daemon...");
    startDaemon();
    await waitForStart();

    const deviceId = await getDeviceId();
    writeConfig({ apiKey, apiPort, deviceId });
    config = readConfig()!;
  }

  // Step 3: Add the remote device
  await addDevice(remote.deviceId);

  // Step 4: Share all folders with the remote device
  for (const folderId of remote.folders) {
    await addDeviceToFolder(folderId, remote.deviceId);
  }

  console.log(`\nConnected! Syncing with ${remote.deviceId.substring(0, 7)}...`);
}
