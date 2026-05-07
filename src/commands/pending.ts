/**
 * pending.ts — The `botsync pending` command.
 *
 * Surfaces the same "this device wants to connect" / "this folder is being
 * offered" notifications that Syncthing's web UI shows. Without this, users
 * who lost local state had to either know each peer's device ID by heart
 * (or open the web UI) to recover. Now the recovery is one CLI call.
 *
 * Default is interactive: lists everything pending and prompts for accept-all.
 * `--yes` skips the prompt for scripting.
 */

import { createInterface } from "readline/promises";
import chalk from "chalk";

import { FOLDERS, readConfig } from "../config.js";
import {
  addDevice,
  addDeviceToFolder,
  apiCall,
  getPendingDevices,
  getPendingFolders,
} from "../syncthing.js";
import * as ui from "../ui.js";

// Folder IDs that older botsync versions used but v0.5.0 removed. If a peer
// running an old botsync offers these, accepting would re-create deprecated
// folders that this version doesn't support. Surface them as a hint instead.
const DEPRECATED_FOLDERS = new Set(["botsync-deliverables", "botsync-inbox"]);

export interface PendingOptions {
  yes?: boolean;
}

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function pending(opts: PendingOptions = {}): Promise<void> {
  ui.header();

  if (!readConfig()) {
    ui.error("botsync is not initialized. Run `botsync init` first.");
    process.exit(1);
  }

  try {
    await apiCall("GET", "/rest/system/ping");
  } catch {
    ui.error("Syncthing daemon is not running. Run `botsync start` first.");
    process.exit(1);
  }

  const [devices, allFolders] = await Promise.all([
    getPendingDevices(),
    getPendingFolders(),
  ]);
  // Split out deprecated folder offers so we never recreate folders that
  // v0.5.0 explicitly removed. We still surface the count so the user knows
  // a peer is on an old version and should upgrade.
  const folders = allFolders.filter((f) => !DEPRECATED_FOLDERS.has(f.folderId));
  const skipped = allFolders.filter((f) => DEPRECATED_FOLDERS.has(f.folderId));

  if (devices.length === 0 && folders.length === 0 && skipped.length === 0) {
    ui.info("No pending invitations.");
    ui.gap();
    return;
  }

  if (devices.length > 0) {
    ui.info(`${chalk.cyan(devices.length)} pending device(s):`);
    for (const d of devices) {
      const short = d.deviceId.substring(0, 7);
      const name = d.name || "(no name)";
      ui.info(`  ${chalk.white(short)}…  ${name}  ${chalk.dim(d.address)}`);
    }
    ui.gap();
  }

  if (folders.length > 0) {
    ui.info(`${chalk.cyan(folders.length)} pending folder share(s):`);
    for (const f of folders) {
      const short = f.offeredBy.substring(0, 7);
      ui.info(`  ${chalk.white(f.folderId)}  from ${short}…`);
    }
    ui.gap();
  }

  if (skipped.length > 0) {
    const ids = [...new Set(skipped.map((f) => f.folderId))].join(", ");
    const peers = [...new Set(skipped.map((f) => f.offeredBy.substring(0, 7)))].join(", ");
    ui.info(
      chalk.yellow(
        `Skipping ${skipped.length} offer(s) for deprecated folders: ${ids}`,
      ),
    );
    ui.info(chalk.dim(`  From peers: ${peers}…  (ask them to upgrade botsync)`));
    ui.gap();
  }

  if (devices.length === 0 && folders.length === 0) {
    // Only deprecated offers — nothing actionable to accept.
    return;
  }

  if (!opts.yes) {
    const ok = await confirmPrompt("Accept all? [y/N] ");
    if (!ok) {
      ui.info("Aborted. Nothing changed.");
      ui.gap();
      return;
    }
  }

  // Devices to add: union of pending-device entries AND any device that's
  // offering us a folder but isn't already configured. The latter case
  // happens during recovery — Syncthing dedupes once a device exists.
  const deviceIds = new Set<string>();
  for (const d of devices) deviceIds.add(d.deviceId);
  for (const f of folders) deviceIds.add(f.offeredBy);

  const spin = ui.spinner("Accepting...");
  for (const id of deviceIds) {
    await addDevice(id);
  }

  // For each pending folder offer, share the folder back. We also
  // pre-share our default folders with brand-new devices so the connection
  // becomes useful immediately — recovery target is "everything works
  // again" and the user has already opted in via the prompt above.
  const sharedSet = new Set<string>();
  for (const f of folders) {
    await addDeviceToFolder(f.folderId, f.offeredBy);
    sharedSet.add(`${f.folderId}:${f.offeredBy}`);
  }
  for (const id of deviceIds) {
    for (const folder of FOLDERS) {
      const key = `${folder.id}:${id}`;
      if (sharedSet.has(key)) continue;
      await addDeviceToFolder(folder.id, id);
    }
  }
  spin.stop();

  ui.stepDone(
    `Accepted ${deviceIds.size} device(s), ${folders.length} folder share(s).`,
  );
  ui.info("Sync will start once peers reconnect.");
  ui.gap();
}
