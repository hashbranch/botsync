/**
 * ui.ts — Pretty terminal output for botsync.
 *
 * Inspired by Claude Code's minimal, elegant CLI style:
 * - 2-space indent on everything
 * - Muted colors, not a rainbow
 * - Box-drawing for important info (passphrases)
 * - Spinners for async waits
 * - Clean status tables with alignment
 *
 * Uses chalk@4 (CJS-compatible) and ora@5 (CJS-compatible).
 */

import chalk from "chalk";
import ora, { Ora } from "ora";

// Brand colors
const brand = chalk.cyan;
const success = chalk.green;
const dim = chalk.dim;
const bold = chalk.bold;
const warn = chalk.yellow;

const INDENT = "  ";

/** The botsync diamond header — printed once at the top of every command. */
export function header(): void {
  console.log();
  console.log(`${INDENT}${brand("◆")} ${bold("botsync")}`);
  console.log();
}

/** A step that completed successfully. */
export function stepDone(label: string): void {
  console.log(`${INDENT}${success("✓")} ${dim(label)}`);
}

/** A step that failed. */
export function stepFail(label: string): void {
  console.log(`${INDENT}${chalk.red("✗")} ${label}`);
}

/** Print an info line (indented, dimmed). */
export function info(text: string): void {
  console.log(`${INDENT}${dim(text)}`);
}

/** Print a blank line. */
export function gap(): void {
  console.log();
}

/**
 * Display the passphrase in a box so it visually pops.
 * The box auto-sizes to the passphrase length (with wrapping for long ones).
 */
export function passphraseBox(passphrase: string, command: string): void {
  // Wrap passphrase at ~50 chars for readability
  const maxWidth = 52;
  const lines: string[] = [];
  for (let i = 0; i < passphrase.length; i += maxWidth) {
    lines.push(passphrase.substring(i, i + maxWidth));
  }

  const contentWidth = Math.max(maxWidth, command.length + 2);
  const top = `┌${"─".repeat(contentWidth + 2)}┐`;
  const bot = `└${"─".repeat(contentWidth + 2)}┘`;
  const empty = `│${" ".repeat(contentWidth + 2)}│`;
  const pad = (s: string) => {
    const visible = s.length;
    return `│ ${s}${" ".repeat(Math.max(0, contentWidth - visible))} │`;
  };

  console.log(`${INDENT}${dim(top)}`);
  console.log(`${INDENT}${dim("│")} ${bold("Your passphrase:")}${" ".repeat(Math.max(0, contentWidth - 17))}${dim("│")}`);
  console.log(`${INDENT}${dim(empty)}`);
  for (const line of lines) {
    console.log(`${INDENT}${dim("│")} ${brand(line)}${" ".repeat(Math.max(0, contentWidth - line.length))} ${dim("│")}`);
  }
  console.log(`${INDENT}${dim(empty)}`);
  console.log(`${INDENT}${dim("│")} ${dim("On the other machine:")}${" ".repeat(Math.max(0, contentWidth - 21))}${dim("│")}`);
  console.log(`${INDENT}${dim("│")} ${chalk.white(command)}${" ".repeat(Math.max(0, contentWidth - command.length))} ${dim("│")}`);
  console.log(`${INDENT}${dim(bot)}`);
}

/** Start a spinner. Returns the ora instance so the caller can stop it. */
export function spinner(text: string): Ora {
  return ora({
    text: dim(text),
    prefixText: INDENT,
    spinner: "dots",
    color: "cyan",
  }).start();
}

/** Print the "paired" success message. */
export function paired(deviceId: string): void {
  const short = deviceId.substring(0, 7);
  console.log();
  console.log(`${INDENT}${success("✓")} ${bold("Paired with")} ${brand(short)} ${dim("— sync is active")}`);
  console.log();
}

/** Print connection success for the join side. */
export function connected(deviceId: string): void {
  const short = deviceId.substring(0, 7);
  console.log(`${INDENT}${success("✓")} ${bold("Connected to")} ${brand(short)}`);
  console.log();
}

/** Print the status table. */
export function statusTable(
  peers: number,
  deviceId: string,
  folders: Array<{ name: string; synced: boolean; state: string; lastChange?: string }>
): void {
  header();

  // Peer count with color
  const peerStr = peers > 0 ? success(`${peers} connected`) : warn("0 connected");
  console.log(`${INDENT}${dim("Peers")}    ${peerStr}`);
  console.log(`${INDENT}${dim("Device")}   ${brand(deviceId.substring(0, 7))}${dim("...")}`);
  console.log();

  // Folder rows — fixed-width columns
  for (const f of folders) {
    const icon = f.synced ? success("✓") : warn("⟳");
    const state = f.synced ? dim(f.state) : warn(f.state);
    const name = f.name.padEnd(18);
    console.log(`${INDENT}${icon} ${name}${state}`);
  }
  console.log();
}

/** Stopped message. */
export function stopped(): void {
  header();
  console.log(`${INDENT}${dim("Daemon stopped.")}`);
  console.log();
}

/** Not running message. */
export function notRunning(): void {
  header();
  console.log(`${INDENT}${warn("Not running.")} ${dim("Run")} ${chalk.white("botsync init")} ${dim("to start.")}`);
  console.log();
}

/** Error message. */
export function error(msg: string): void {
  console.log();
  console.log(`${INDENT}${chalk.red("✗")} ${msg}`);
  console.log();
}
