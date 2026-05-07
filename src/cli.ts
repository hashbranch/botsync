#!/usr/bin/env node
/**
 * cli.ts — Entry point for the botsync CLI.
 *
 * Routes commands to their handlers. The shebang line makes it
 * executable as `npx botsync` or a globally installed CLI.
 */

import { Command } from "commander";
import { init } from "./commands/init.js";
import { invite } from "./commands/invite.js";
import { join } from "./commands/join.js";
import { status } from "./commands/status.js";
import { start } from "./commands/start.js";
import { stop } from "./commands/stop.js";
import { doctor } from "./commands/doctor.js";
import { update } from "./commands/update.js";
import { id } from "./commands/id.js";
import { addDeviceCmd } from "./commands/add-device.js";
import { pending } from "./commands/pending.js";
import {
  folderAdd,
  folderList,
  folderRemove,
  folderShare,
  folderUnshare,
} from "./commands/folder.js";
import { createLogger } from "./log.js";
import { VERSION } from "./version.js";
import * as ui from "./ui.js";

const program = new Command();
const logger = createLogger("cli");

async function runCommand(name: string, fn: () => Promise<void>): Promise<void> {
  logger.info("command start", { command: name });
  try {
    await fn();
    logger.info("command success", { command: name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("command failed", "BSYNC_COMMAND_FAILED", {
      command: name,
      error: message,
    });
    ui.error(message);
    process.exit(1);
  }
}

program
  .name("botsync")
  .description("P2P file sync for AI agents.")
  .version(VERSION);

program
  .command("init")
  .description("Initialize botsync and start syncing. Prints a passphrase for pairing.")
  .option("--force", "Re-initialize even if already set up. WARNING: clears all peer pairings.")
  .action(async (options: { force?: boolean }) => runCommand("init", () => init(options)));

program
  .command("invite")
  .description("Generate a new pairing code to add another machine to this network.")
  .action(async () => runCommand("invite", invite));

program
  .command("join <passphrase>")
  .description("Connect to another botsync instance using a passphrase.")
  .action(async (passphrase: string) => runCommand("join", () => join(passphrase)));

program
  .command("status")
  .description("Show sync status — peers, folders, sync progress.")
  .action(async () => runCommand("status", status));

program
  .command("start")
  .description("Restart botsync daemons without reinitializing.")
  .action(async () => runCommand("start", start));

program
  .command("doctor")
  .description("Collect local diagnostics for common botsync failures.")
  .option("--json", "Emit the diagnostics report as JSON.")
  .action(async (options: { json?: boolean }) => runCommand("doctor", () => doctor(options)));

program
  .command("update")
  .description("Check for updates and install the latest version.")
  .action(async () => runCommand("update", update));

program
  .command("stop")
  .description("Stop the botsync daemon.")
  .action(async () => runCommand("stop", stop));

program
  .command("id")
  .description("Print this machine's full Syncthing device ID (for pairing).")
  .action(async () => runCommand("id", id));

program
  .command("add-device <deviceId>")
  .description("Add a peer's device ID and share the default folder (no passphrase needed).")
  .action(async (deviceId: string) =>
    runCommand("add-device", () => addDeviceCmd(deviceId)),
  );

program
  .command("pending")
  .description("List and accept pending peer/folder invitations from Syncthing.")
  .option("--yes", "Accept all pending invitations without prompting.")
  .action(async (options: { yes?: boolean }) =>
    runCommand("pending", () => pending(options)),
  );

// ------------------------------------------------------------------
// `botsync folder ...` — custom folder management.
// All subcommands go through the Syncthing REST API so stock Syncthing
// peers can accept the resulting folder shares with no special client.
// ------------------------------------------------------------------
const folder = program
  .command("folder")
  .description("Manage custom sync folders (add, list, remove, share).");

folder
  .command("add <name>")
  .description("Create a new sync folder and share it with paired peers.")
  .option("--path <path>", "Local path for the folder (default: ~/sync/<name>)")
  .option(
    "--type <type>",
    "Folder sync mode: sendreceive | sendonly | receiveonly",
    "sendreceive",
  )
  .option(
    "--devices <ids>",
    "Comma-separated device IDs to share with (default: all paired peers)",
  )
  .action(async (name: string, opts: { path?: string; type?: string; devices?: string }) =>
    runCommand("folder-add", () => folderAdd(name, opts)),
  );

folder
  .command("list")
  .description("List botsync-managed folders and their sync state.")
  .action(async () => runCommand("folder-list", () => folderList()));

folder
  .command("remove <name>")
  .description("Unshare a folder from local Syncthing (local files are kept).")
  .option("--force", "Skip the confirmation prompt")
  .action(async (name: string, opts: { force?: boolean }) =>
    runCommand("folder-remove", () => folderRemove(name, opts)),
  );

folder
  .command("share <name> <deviceId>")
  .description("Add a paired device to an existing folder's share list.")
  .action(async (name: string, deviceId: string) =>
    runCommand("folder-share", () => folderShare(name, deviceId)),
  );

folder
  .command("unshare <name> <deviceId>")
  .description("Remove a device from a folder's share list (still paired).")
  .action(async (name: string, deviceId: string) =>
    runCommand("folder-unshare", () => folderUnshare(name, deviceId)),
  );

program.parse();
