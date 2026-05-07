/**
 * init-guard.test.ts — Tests for the `botsync init` re-init guard.
 *
 * Re-running `botsync init` on an already-set-up machine used to silently
 * wipe the Syncthing peer list and rotate the relay network secret —
 * recovery required re-pairing every peer by hand. The guard refuses to
 * proceed unless --force is passed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-init-guard-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("botsync init guard", () => {
  it("refuses to re-init when config + deviceId already present", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({
      apiKey: "k",
      apiPort: 1234,
      deviceId: "GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX",
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const { init } = await import("../src/commands/init.js");

    await expect(init()).rejects.toThrow("exit:1");

    exitSpy.mockRestore();
  });

});
