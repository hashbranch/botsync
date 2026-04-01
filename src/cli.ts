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
  .action(async () => runCommand("init", init));

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

program.parse();
