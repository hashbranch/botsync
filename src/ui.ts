/**
 * ui.ts — Pretty terminal output for botsync.
 *
 * Uses chalk@4 (CJS-compatible) and ora@5 (CJS-compatible).
 */

import chalk from "chalk";
import ora, { Ora } from "ora";

const brand = chalk.cyan;
const success = chalk.green;
const dim = chalk.dim;
const bold = chalk.bold;
const warn = chalk.yellow;

const INDENT = "  ";
const CHECK = success("✓");
const CROSS = chalk.red("✗");

/** The botsync diamond header. */
export function header(): void {
  console.log();
  console.log(`${INDENT}${brand("◆")} ${bold("botsync")}`);
  console.log();
}

/** A step that completed successfully. */
export function stepDone(label: string): void {
  console.log(`${INDENT}${CHECK} ${dim(label)}`);
}

/** A step that failed. */
export function stepFail(label: string): void {
  console.log(`${INDENT}${CROSS} ${label}`);
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
 * Display the passphrase in a box (short codes) or plain text (long passphrases).
 *
 * Short relay codes (4 words, ~30 chars) look great in a box.
 * Long offline passphrases (200+ chars base58) break the box — terminal wraps
 * the line, destroying alignment and making it impossible to copy. For those,
 * we skip the box entirely and print plain indented text that's easy to select.
 */
export function passphraseBox(passphrase: string, command: string): void {
  const MAX_BOX_WIDTH = 70;

  const lines = [
    { plain: "Your passphrase:", formatted: bold("Your passphrase:") },
    { plain: "", formatted: "" },
    { plain: passphrase, formatted: brand(passphrase) },
    { plain: "", formatted: "" },
    { plain: "On the other machine:", formatted: dim("On the other machine:") },
    { plain: command, formatted: chalk.white(command) },
  ];

  const maxPlain = Math.max(...lines.map((l) => l.plain.length));

  // If any line exceeds terminal-safe width, skip the box entirely
  if (maxPlain > MAX_BOX_WIDTH) {
    console.log(`${INDENT}${bold("Your passphrase:")}`);
    console.log();
    console.log(`${INDENT}${brand(passphrase)}`);
    console.log();
    console.log(`${INDENT}${dim("On the other machine:")}`);
    console.log(`${INDENT}${chalk.white(command)}`);
    return;
  }

  // Short content — draw a nice box
  // innerWidth = content area between │ bars (leading space + text + trailing space)
  const innerWidth = maxPlain + 2;
  const hr = "─".repeat(innerWidth);

  console.log(`${INDENT}${dim("┌" + hr + "┐")}`);
  for (const line of lines) {
    const padding = " ".repeat(innerWidth - line.plain.length - 1);
    console.log(`${INDENT}${dim("│")} ${line.formatted}${padding}${dim("│")}`);
  }
  console.log(`${INDENT}${dim("└" + hr + "┘")}`);
}

/**
 * Start a spinner. Returns the ora instance.
 * Symbol and alignment patched to match stepDone output exactly.
 */
export function spinner(text: string): Ora {
  const s = ora({
    text: dim(text),
    prefixText: "",
    spinner: "dots",
    color: "cyan",
    indent: 2,
  }).start();

  s.succeed = (t?: string) => {
    s.stopAndPersist({
      symbol: `${INDENT}${CHECK}`,
      text: dim(t || text),
      prefixText: "",
    });
    return s;
  };

  s.fail = (t?: string) => {
    s.stopAndPersist({
      symbol: `${INDENT}${CROSS}`,
      text: t || text,
      prefixText: "",
    });
    return s;
  };

  return s;
}

/** Print the "paired" success message. */
export function paired(deviceId: string): void {
  const short = deviceId.substring(0, 7);
  console.log();
  console.log(`${INDENT}${CHECK} ${bold("Paired with")} ${brand(short)} ${dim("— sync is active")}`);
  console.log();
}

/** Print connection success for the join side. */
export function connected(deviceId: string): void {
  const short = deviceId.substring(0, 7);
  console.log(`${INDENT}${CHECK} ${bold("Connected to")} ${brand(short)}`);
  console.log();
}

/** Print the status table. */
export function statusTable(
  peers: number,
  deviceId: string,
  folders: Array<{ name: string; synced: boolean; state: string; lastChange?: string }>,
  eventsStatus?: string
): void {
  header();

  const peerStr = peers > 0 ? success(`${peers} connected`) : warn("0 connected");
  console.log(`${INDENT}${dim("Peers")}    ${peerStr}`);
  console.log(`${INDENT}${dim("Device")}   ${brand(deviceId.substring(0, 7))}${dim("...")}`);
  if (eventsStatus) {
    const eventsStr = eventsStatus.startsWith("running")
      ? success(eventsStatus)
      : dim(eventsStatus);
    console.log(`${INDENT}${dim("Events")}   ${eventsStr}`);
  }
  console.log();

  for (const f of folders) {
    const icon = f.synced ? CHECK : warn("⟳");
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
  console.log(`${INDENT}${CROSS} ${msg}`);
  console.log();
}
