/**
 * pending.test.ts — Tests for `botsync pending`.
 *
 * Validates the helper parsing of Syncthing's nested response shape and
 * the not-initialized exit branch. The accept path requires a live daemon
 * and is exercised end-to-end via the pairing flow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-pending-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

/**
 * Mock the fetch the rest of `apiCall` uses. Returns whatever JSON we
 * stage. Each call consumes one staged response in FIFO order.
 */
function mockFetchOnce(body: unknown): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as never,
    );
}

describe("pending helpers", () => {
  it("getPendingDevices flattens Syncthing's response into an array", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({ apiKey: "k", apiPort: 8000, deviceId: "X" });

    const fetchSpy = mockFetchOnce({
      "GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX": {
        time: "2026-05-07T14:00:00Z",
        name: "Toms-MBP",
        address: "tcp://10.0.0.1:22000",
      },
    });

    const { getPendingDevices } = await import("../src/syncthing.js");
    const result = await getPendingDevices();
    expect(result).toEqual([
      {
        deviceId:
          "GMWDB3G-M6EVYDB-Y3DLJSB-NZAN5JF-PLSSGKQ-BKGRA4V-WTDILQO-KKCHLAX",
        name: "Toms-MBP",
        address: "tcp://10.0.0.1:22000",
        time: "2026-05-07T14:00:00Z",
      },
    ]);
    fetchSpy.mockRestore();
  });

  it("getPendingFolders flattens nested offeredBy into one entry per (folder, device)", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({ apiKey: "k", apiPort: 8000, deviceId: "X" });

    const fetchSpy = mockFetchOnce({
      "botsync-shared": {
        offeredBy: {
          "DEVICEA1-1234567-AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF": {
            time: "2026-05-07T14:00:00Z",
            label: "shared",
          },
          "DEVICEB1-1234567-AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF": {
            time: "2026-05-07T14:01:00Z",
            label: "shared",
          },
        },
      },
      "botsync-tera": {
        offeredBy: {
          "DEVICEA1-1234567-AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF": {
            time: "2026-05-07T14:02:00Z",
            label: "tera",
          },
        },
      },
    });

    const { getPendingFolders } = await import("../src/syncthing.js");
    const result = await getPendingFolders();
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.folderId).sort()).toEqual([
      "botsync-shared",
      "botsync-shared",
      "botsync-tera",
    ]);
    fetchSpy.mockRestore();
  });

  it("getPendingDevices returns empty array on empty response", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    cfg.writeConfig({ apiKey: "k", apiPort: 8000, deviceId: "X" });

    const fetchSpy = mockFetchOnce({});
    const { getPendingDevices } = await import("../src/syncthing.js");
    expect(await getPendingDevices()).toEqual([]);
    fetchSpy.mockRestore();
  });
});

describe("botsync pending", () => {
  it("exits with an error when botsync is not initialized", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    const { pending } = await import("../src/commands/pending.js");
    await expect(pending()).rejects.toThrow("exit:1");

    exitSpy.mockRestore();
  });
});
