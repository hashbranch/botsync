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
  MANIFEST_FILE,
  writeConfig,
  writeNetworkId,
  writeNetworkSecret,
} from "../config.js";

import {
  downloadSyncthing,
  generateConfig,
  startDaemon,
  waitForStart,
  getDeviceId,
  cleanupStale,
} from "../syncthing.js";

import { waitForNewPeer } from "../peer-discovery.js";

import { createCode } from "../passphrase.js";
import { startHeartbeat } from "../heartbeat.js";
import { startEvents } from "../events.js";
import * as ui from "../ui.js";

/**
 * Pick a random port in the ephemeral range for the Syncthing REST API.
 * We avoid 8384 (Syncthing's default) to not conflict with any existing
 * Syncthing installation the user might have.
 */
function randomPort(): number {
  return 27000 + Math.floor(Math.random() * 10000);
}

/** Generate the BOTSYNC.md manifest for the sync root. */
function generateManifest(): string {
  return `# Botsync

This folder is synced in real time between paired machines using [botsync](https://github.com/hashbranch/botsync).

## shared/

Read and write freely. All paired machines see changes immediately.
Organize this folder however you like — create subfolders, drop files, etc.

## How it works

- Files sync peer-to-peer (no cloud server)
- Changes appear on other machines within seconds
- If the same file is edited on two machines simultaneously, Syncthing keeps the latest version and saves the other as a \`.sync-conflict\` file — nothing is lost

## For agents

If you are an AI agent with access to this folder:
- You can read and write files in \`shared/\` to communicate with other machines and agents
- Check for new files periodically or watch for changes
- Avoid writing to the same file that another agent is actively writing to
- Use subdirectories to organize by purpose (e.g. \`shared/tasks/\`, \`shared/output/\`)
- The \`.botsync/\` directory is internal — do not modify it

## Commands

\`\`\`bash
botsync status   # Check sync status and connected peers
botsync invite   # Add another machine to this network
botsync stop     # Stop syncing
botsync start    # Resume syncing
botsync update   # Update to the latest version
\`\`\`
`;
}

export async function init(): Promise<void> {
  ui.header();

  // Step 0: Kill any stale Syncthing from a previous interrupted run
  cleanupStale();

  // Step 1: Create directory structure + manifest
  for (const folder of FOLDERS) {
    mkdirSync(folder.path, { recursive: true });
  }
  mkdirSync(BOTSYNC_DIR, { recursive: true });
  mkdirSync(SYNCTHING_CONFIG_DIR, { recursive: true });

  if (!existsSync(MANIFEST_FILE)) {
    writeFileSync(MANIFEST_FILE, generateManifest());
  }
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

  // Persist webhook config from env vars so status/start can read it later
  // without requiring the env vars to be set again.
  const webhookToken = process.env.OPENCLAW_HOOKS_TOKEN;
  const webhookUrl = process.env.OPENCLAW_HOOKS_URL;
  writeConfig({
    apiKey,
    apiPort,
    deviceId,
    ...(webhookToken && { webhookToken }),
    ...(webhookUrl && { webhookUrl }),
  });

  // Step 5b: Generate network ID + secret and start heartbeat
  // SECURITY: networkSecret is a bearer token for relay auth.
  // It's shared with the joiner via the pairing code (one-time use, 10-min TTL).
  // The relay stores only sha256(secret), never the plaintext.
  const networkId = randomUUID();
  const networkSecret = randomUUID();
  writeNetworkId(networkId);
  writeNetworkSecret(networkSecret);
  startHeartbeat(networkSecret);
  startEvents();
  ui.stepDone("Network registered");

  // Step 6: Register with relay and display the code
  ui.gap();
  const { code, isRelay } = await createCode({
    deviceId,
    folders: FOLDERS.map((f) => f.id),
    networkId,
    networkSecret,
  });

  if (isRelay) {
    ui.passphraseBox(code, `npx botsync join ${code}`);
    ui.info("Code expires in 10 minutes.");
  } else {
    ui.info("Relay unavailable — using offline passphrase:");
    ui.gap();
    ui.passphraseBox(code, `npx botsync join ${code.substring(0, 20)}...`);
  }
  ui.gap();
  ui.info(`Dashboard: https://botsync.io/dashboard#${networkId}`);
  ui.gap();

  // Step 7: Wait for the joining device to connect and auto-accept it
  const peerSpin = ui.spinner("Waiting for peer...");
  const accepted = await waitForNewPeer(peerSpin);
  if (accepted) {
    peerSpin.stop();
    ui.paired(accepted);
  }
}
