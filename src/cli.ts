#!/usr/bin/env node
/**
 * cli.ts — Entry point for the botsync CLI.
 *
 * This is the file that runs when you type `botsync` or `npx botsync`.
 * It sets up the four commands (init, join, status, stop) using Commander
 * and dispatches to the appropriate handler.
 *
 * The shebang line (#!/usr/bin/env node) makes it executable as a CLI tool
 * when installed globally or via npx.
 */

import { Command } from "commander";
import { init } from "./commands/init.js";
import { join } from "./commands/join.js";
import { status } from "./commands/status.js";
import { stop } from "./commands/stop.js";

const program = new Command();

program
  .name("botsync")
  .description("P2P file sync for AI agents. Syncthing under the hood.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize botsync and start syncing. Prints a passphrase for pairing.")
  .action(async () => {
    try {
      await init();
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
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
      console.error("Error:", err instanceof Error ? err.message : err);
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
      console.error("Error:", err instanceof Error ? err.message : err);
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
      console.error("Error:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
