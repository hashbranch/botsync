/**
 * id.test.ts — Tests for the `botsync id` command.
 *
 * Verifies that the device ID is printed cleanly to stdout (no formatting,
 * no extra output) so it pipes into `pbcopy` or shell substitutions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-id-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("botsync id", () => {
  it("prints the cached device ID and nothing else", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({
      apiKey: "k",
      apiPort: 1234,
      deviceId: "GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX",
    });

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const { id } = await import("../src/commands/id.js");
    await id();

    spy.mockRestore();
    expect(logs).toEqual([
      "GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX",
    ]);
  });

  it("exits with an error when botsync is not initialized", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    const { id } = await import("../src/commands/id.js");
    await expect(id()).rejects.toThrow("exit:1");

    exitSpy.mockRestore();
  });
});
