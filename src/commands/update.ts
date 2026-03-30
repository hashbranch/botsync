/**
 * update.ts — The `botsync update` command.
 *
 * Checks npm for the latest version and updates if newer.
 * Works for both global installs and npx usage.
 */

import { execSync } from "child_process";
import { VERSION } from "../version.js";
import * as ui from "../ui.js";

export async function update(): Promise<void> {
  ui.header();

  // Check latest version on npm
  const spin = ui.spinner("Checking for updates...");
  let latest: string;
  try {
    latest = execSync("npm view botsync version", { encoding: "utf-8" }).trim();
  } catch {
    spin.fail();
    ui.error("Could not check for updates. Are you online?");
    process.exit(1);
  }
  spin.stop();

  if (latest === VERSION) {
    ui.stepDone(`Already on the latest version (${VERSION})`);
    return;
  }

  ui.info(`Update available: ${VERSION} → ${latest}`);
  ui.gap();

  // Detect install method and update accordingly
  const spin2 = ui.spinner(`Updating to ${latest}...`);
  try {
    // Try global update first — works if installed globally
    execSync("npm install -g botsync@latest", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    spin2.succeed();
    ui.stepDone(`Updated to ${latest}`);
  } catch {
    spin2.fail();
    ui.info(`Could not auto-update. Run manually:`);
    ui.gap();
    ui.info(`  npm install -g botsync@latest`);
    ui.gap();
  }
}
