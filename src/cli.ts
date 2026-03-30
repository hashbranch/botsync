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
import { update } from "./commands/update.js";
import { VERSION } from "./version.js";
import * as ui from "./ui.js";

const program = new Command();

program
  .name("botsync")
  .description("P2P file sync for AI agents.")
  .version(VERSION);

program
  .command("init")
  .description("Initialize botsync and start syncing. Prints a passphrase for pairing.")
  .action(async () => {
    try {
      await init();
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("invite")
  .description("Generate a new pairing code to add another machine to this network.")
  .action(async () => {
    try {
      await invite();
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("join <passphrase>")
  .description("Connect to another botsync instance using a passphrase.")
  .action(async (passphrase: string) => {
    try {
      await join(passphrase);
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show sync status — peers, folders, sync progress.")
  .action(async () => {
    try {
      await status();
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("start")
  .description("Restart botsync daemons without reinitializing.")
  .action(async () => {
    try {
      await start();
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("update")
  .description("Check for updates and install the latest version.")
  .action(async () => {
    try {
      await update();
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop the botsync daemon.")
  .action(async () => {
    try {
      await stop();
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
