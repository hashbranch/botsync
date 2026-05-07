/**
 * add-device.test.ts — Tests for the `botsync add-device` command.
 *
 * Covers the input-validation and not-initialized branches. The
 * happy-path (actually adding to Syncthing) requires a running daemon
 * and is exercised end-to-end by the pairing flow's tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-add-device-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

const VALID_ID = "GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX";

describe("botsync add-device", () => {
  it("exits with an error when botsync is not initialized", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    const { addDeviceCmd } = await import("../src/commands/add-device.js");
    await expect(addDeviceCmd(VALID_ID)).rejects.toThrow("exit:1");

    exitSpy.mockRestore();
  });

  it("rejects malformed device IDs", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({ apiKey: "k", apiPort: 1234, deviceId: VALID_ID });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const { addDeviceCmd } = await import("../src/commands/add-device.js");

    // Wrong group count
    await expect(addDeviceCmd("ABC-DEF")).rejects.toThrow("exit:1");
    // Wrong group length
    await expect(addDeviceCmd("ABCDEF1-ABCDEF1")).rejects.toThrow("exit:1");
    // Lowercase chars that aren't all in the base32 set
    await expect(addDeviceCmd("not-a-real-device-id")).rejects.toThrow("exit:1");

    exitSpy.mockRestore();
  });

  it("accepts a well-formed device ID and reaches the daemon-check step", async () => {
    // We don't have a real daemon here, so the API ping fails and we exit 1
    // — but with a *different* error message than the validation branch. The
    // important thing is the validation regex accepts the ID; the daemon
    // failure proves we got past validation.
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({ apiKey: "k", apiPort: 1, deviceId: VALID_ID });

    // Spy on ui.error AFTER resetModules so the spy targets the same module
    // instance that add-device will pick up.
    const errors: string[] = [];
    const ui = await import("../src/ui.js");
    const errSpy = vi.spyOn(ui, "error").mockImplementation((msg: string) => {
      errors.push(msg);
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    const { addDeviceCmd } = await import("../src/commands/add-device.js");

    await expect(addDeviceCmd(VALID_ID)).rejects.toThrow("exit:1");
    expect(errors.some((e) => /daemon is not running/i.test(e))).toBe(true);
    expect(errors.some((e) => /invalid device id/i.test(e))).toBe(false);

    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("normalizes lowercase + whitespace before validating", async () => {
    // Same shape as VALID_ID but lowercase with surrounding whitespace.
    // Should pass validation (and then fail at daemon-check, like above).
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({ apiKey: "k", apiPort: 1, deviceId: VALID_ID });

    const errors: string[] = [];
    const ui = await import("../src/ui.js");
    const errSpy = vi.spyOn(ui, "error").mockImplementation((msg: string) => {
      errors.push(msg);
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    const { addDeviceCmd } = await import("../src/commands/add-device.js");

    await expect(addDeviceCmd(`  ${VALID_ID.toLowerCase()}  `)).rejects.toThrow(
      "exit:1",
    );
    expect(errors.some((e) => /invalid device id/i.test(e))).toBe(false);

    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
