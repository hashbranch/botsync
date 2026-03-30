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

  // Try without sudo first, then with sudo on EACCES
  const spin2 = ui.spinner(`Updating to ${latest}...`);
  try {
    execSync("npm install -g botsync@latest", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    spin2.succeed();
    ui.stepDone(`Updated to ${latest}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") && process.platform !== "win32") {
      spin2.text = `Updating to ${latest} (requires sudo)...`;
      try {
        execSync("sudo npm install -g botsync@latest", {
          encoding: "utf-8",
          stdio: "inherit",
        });
        spin2.succeed();
        ui.stepDone(`Updated to ${latest}`);
      } catch {
        spin2.fail();
        ui.info(`Could not auto-update. Run manually:`);
        ui.gap();
        ui.info(`  sudo npm install -g botsync@latest`);
        ui.gap();
      }
    } else {
      spin2.fail();
      ui.info(`Could not auto-update. Run manually:`);
      ui.gap();
      ui.info(`  npm install -g botsync@latest`);
      ui.gap();
    }
  }
}
