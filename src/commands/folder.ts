/**
 * folder.ts — The `botsync folder ...` subcommands.
 *
 * Thin UX layer on top of src/folders.ts. Handles:
 *   - botsync folder add <name> [--path] [--type] [--devices]
 *   - botsync folder list
 *   - botsync folder remove <name> [--force]
 *   - botsync folder share <name> <deviceId>
 *   - botsync folder unshare <name> <deviceId>
 *
 * Business logic lives in src/folders.ts. This file only handles input
 * parsing, confirmation prompts, and rendering.
 */

import { createInterface } from "readline/promises";
import chalk from "chalk";

import { apiCall } from "../syncthing.js";
import {
  FolderType,
  VALID_FOLDER_TYPES,
  addFolder,
  folderIdFor,
  getPairedDevices,
  isDefaultFolder,
  listFolders,
  removeFolder,
  resolveFolderPath,
  shareFolder,
  unshareFolder,
  validateFolderName,
} from "../folders.js";
import * as ui from "../ui.js";

/**
 * Sanity check: every subcommand assumes a running daemon. We surface a
 * nicer error message than "Syncthing API error: ECONNREFUSED" when it isn't.
 */
async function ensureDaemonRunning(): Promise<void> {
  try {
    await apiCall("GET", "/rest/system/ping");
  } catch {
    throw new Error(
      "Syncthing daemon is not running. Run `botsync start` first.",
    );
  }
}

/** Simple yes/no prompt. Defaults to no on empty input. */
async function confirmPrompt(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

// ------------------------------------------------------------------------
// folder add
// ------------------------------------------------------------------------

export interface AddFolderCliOptions {
  path?: string;
  type?: string;
  devices?: string;
}

export async function folderAdd(name: string, opts: AddFolderCliOptions): Promise<void> {
  ui.header();
  await ensureDaemonRunning();

  // Validate up-front so we fail before any API round-trip on bad input.
  validateFolderName(name);

  const type = (opts.type || "sendreceive") as FolderType;
  if (!VALID_FOLDER_TYPES.includes(type)) {
    throw new Error(
      `Invalid --type '${opts.type}'. Use one of: ${VALID_FOLDER_TYPES.join(", ")}.`,
    );
  }

  const path = resolveFolderPath(name, opts.path);

  // Parse comma-separated --devices list. Empty/undefined means "share with
  // every paired peer".
  let devices: string[] | undefined;
  if (opts.devices && opts.devices.trim().length > 0) {
    devices = opts.devices
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
  }

  const result = await addFolder({
    name,
    path,
    type,
    devices,
    // When the user explicitly named peers, reject unknown ones. Default
    // auto-share is permissive because it's just "every paired peer".
    strictDevices: devices !== undefined,
  });

  ui.stepDone(`Folder added: ${chalk.cyan(result.id)}`);
  ui.info(`Path: ${result.path}`);
  ui.info(`Type: ${result.type}`);
  ui.info(`Shared with ${result.deviceCount - 1} peer(s)`);
  ui.gap();

  // Print peer instructions. This doubles as the stock-Syncthing-interop
  // story: a peer running vanilla Syncthing just needs to add our device ID
  // and accept the incoming folder share.
  if (result.devices.length > 1) {
    ui.info("Peers will see a pending folder share on their next sync.");
    ui.info(`They can accept it with:  ${chalk.white(`botsync folder share ${name} <their-device-id>`)}`);
    ui.info("Stock Syncthing peers accept via the web UI's \"Add Folder\" prompt.");
  } else {
    ui.info("No peers paired yet — pair one with `botsync invite`, then:");
    ui.info(`  ${chalk.white(`botsync folder share ${name} <device-id>`)}`);
  }
  ui.gap();
}

// ------------------------------------------------------------------------
// folder list
// ------------------------------------------------------------------------

export async function folderList(): Promise<void> {
  ui.header();
  await ensureDaemonRunning();

  const folders = await listFolders();

  if (folders.length === 0) {
    ui.info("No botsync folders registered.");
    ui.gap();
    return;
  }

  // Keep the rendering minimal. Status is a pair of columns so terminal width
  // isn't a problem. We group default first, then customs alphabetically.
  const sorted = [...folders].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const f of sorted) {
    const tag = f.isDefault ? chalk.dim("[default]") : chalk.cyan("[custom]");
    const state = f.synced ? chalk.green("idle") : chalk.yellow(f.state);
    const name = f.name.padEnd(20);
    ui.info(`${tag} ${name} ${state}`);
    ui.info(`         path: ${f.path}`);
    ui.info(`         type: ${f.type}  peers: ${Math.max(0, f.deviceCount - 1)}`);
  }
  ui.gap();
}

// ------------------------------------------------------------------------
// folder remove
// ------------------------------------------------------------------------

export async function folderRemove(name: string, opts: { force?: boolean } = {}): Promise<void> {
  ui.header();
  await ensureDaemonRunning();

  const id = folderIdFor(name);
  if (isDefaultFolder(id)) {
    throw new Error(
      "Cannot remove the default 'shared' folder. It is managed by `botsync init`.",
    );
  }

  if (!opts.force) {
    ui.info(`About to unshare folder '${name}' from the local Syncthing.`);
    ui.info("Local files are kept on disk; only the sync config is removed.");
    const ok = await confirmPrompt("Continue? [y/N] ");
    if (!ok) {
      ui.info("Aborted.");
      ui.gap();
      return;
    }
  }

  await removeFolder(name);
  ui.stepDone(`Folder removed: ${id}`);
  ui.info("Local files were left in place.");
  ui.gap();
}

// ------------------------------------------------------------------------
// folder share / unshare
// ------------------------------------------------------------------------

export async function folderShare(name: string, deviceId: string): Promise<void> {
  ui.header();
  await ensureDaemonRunning();
  await shareFolder(name, deviceId);
  ui.stepDone(`Folder '${name}' shared with ${deviceId.substring(0, 7)}...`);
  ui.gap();
}

export async function folderUnshare(name: string, deviceId: string): Promise<void> {
  ui.header();
  await ensureDaemonRunning();
  await unshareFolder(name, deviceId);
  ui.stepDone(`Folder '${name}' no longer shared with ${deviceId.substring(0, 7)}...`);
  ui.info("The device is still paired. Only this folder was affected.");
  ui.gap();
}

// ------------------------------------------------------------------------
// Helper exposed to the CLI layer for the default-peers hint.
// ------------------------------------------------------------------------

export async function getPairedPeersSummary(): Promise<{ count: number; ids: string[] }> {
  const ids = await getPairedDevices();
  return { count: ids.length, ids };
}
