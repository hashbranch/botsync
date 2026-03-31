/**
 * join.ts — The `botsync join <passphrase>` command.
 *
 * This is the "machine B" side of the pairing flow. It:
 * 1. Decodes the passphrase to get the init side's device ID + folder list
 * 2. Creates the local directory structure
 * 3. Downloads Syncthing if needed
 * 4. Generates config
 * 5. Starts the daemon
 * 6. Adds the init side as a known device
 * 7. Shares all folders with the init side
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";

import {
  SYNC_DIR,
  BOTSYNC_DIR,
  SYNCTHING_CONFIG_DIR,
  FOLDERS,
  writeConfig,
  readConfig,
  writeNetworkId,
  writeNetworkSecret,
} from "../config.js";

import {
  downloadSyncthing,
  generateConfig,
  startDaemon,
  waitForStart,
  getDeviceId,
  addDevice,
  addDeviceToFolder,
} from "../syncthing.js";

import { resolveCode } from "../passphrase.js";
import { startHeartbeat } from "../heartbeat.js";
import { startEvents } from "../events.js";
import * as ui from "../ui.js";

export async function join(passphrase: string): Promise<void> {
  ui.header();

  // Resolve the code — tries relay first, falls back to base58
  const spin0 = ui.spinner("Resolving pairing code...");
  let remoteId: string;
  let folders: string[];
  let networkId: string | undefined;
  let networkSecret: string | undefined;
  try {
    const data = await resolveCode(passphrase);
    remoteId = data.deviceId;
    folders = data.folders;
    networkId = data.networkId;
    networkSecret = data.networkSecret;
    spin0.succeed();
  } catch (err) {
    spin0.fail();
    ui.error(err instanceof Error ? err.message : "Failed to resolve code");
    process.exit(1);
  }
  const short = remoteId.substring(0, 7);
  ui.info(`Connecting to ${short}...`);
  ui.gap();

  // First time? Set up everything. Existing config? Just ensure daemon is running.
  const existing = readConfig();
  if (!existing) {
    for (const folder of FOLDERS) {
      mkdirSync(folder.path, { recursive: true });
    }
    mkdirSync(BOTSYNC_DIR, { recursive: true });
    mkdirSync(SYNCTHING_CONFIG_DIR, { recursive: true });

    await downloadSyncthing();
    ui.stepDone("Syncthing ready");

    const apiKey = randomUUID();
    const apiPort = 27000 + Math.floor(Math.random() * 10000);

    const configXml = generateConfig(apiKey, apiPort);
    writeFileSync(`${SYNCTHING_CONFIG_DIR}/config.xml`, configXml);
    writeConfig({ apiKey, apiPort });

    const pid = startDaemon();
    ui.stepDone(`Daemon started (PID ${pid})`);

    const spin = ui.spinner("Starting Syncthing...");
    await waitForStart();
    spin.succeed();

    const myId = await getDeviceId();

    // Persist webhook config from env vars so status/start can read it later
    const webhookToken = process.env.OPENCLAW_HOOKS_TOKEN;
    const webhookUrl = process.env.OPENCLAW_HOOKS_URL;
    writeConfig({
      apiKey,
      apiPort,
      deviceId: myId,
      ...(webhookToken && { webhookToken }),
      ...(webhookUrl && { webhookUrl }),
    });
  } else {
    // Config exists — make sure daemon is actually running
    const spin = ui.spinner("Starting Syncthing...");
    try {
      await waitForStart();
      spin.succeed();
    } catch {
      // Daemon not running, restart it
      const pid = startDaemon();
      ui.stepDone(`Daemon restarted (PID ${pid})`);
      await waitForStart();
      spin.succeed();
    }
  }

  // Add the remote device and share folders
  const spin2 = ui.spinner("Pairing...");
  await addDevice(remoteId);
  for (const folderId of folders) {
    await addDeviceToFolder(folderId, remoteId);
  }
  spin2.stop();

  // Save network ID + secret (inherited from init side) and start heartbeat
  if (networkId) {
    writeNetworkId(networkId);
    if (networkSecret) {
      writeNetworkSecret(networkSecret);
    }
    startHeartbeat(networkSecret);
    startEvents();
    ui.connected(remoteId);
    ui.info(`Dashboard: https://botsync.io/dashboard#${networkId}`);
  } else {
    ui.connected(remoteId);
  }
}
