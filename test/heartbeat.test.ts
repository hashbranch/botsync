/**
 * heartbeat.test.ts — Tests for heartbeat PID management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

async function freshConfig() {
  vi.resetModules();
  return await import("../src/config.js");
}

async function freshHeartbeat() {
  vi.resetModules();
  return await import("../src/heartbeat.js");
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-hb-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe("isHeartbeatRunning", () => {
  it("returns false when no PID file exists", async () => {
    const hb = await freshHeartbeat();
    expect(hb.isHeartbeatRunning()).toBe(false);
  });

  it("returns false when PID file has dead process", async () => {
    const cfg = await freshConfig();
    // Need to re-import heartbeat after config so they share the same env
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const hb = await import("../src/heartbeat.js");

    mkdirSync(cfg.BOTSYNC_DIR, { recursive: true });
    const pidFile = join(cfg.BOTSYNC_DIR, "heartbeat.pid");
    writeFileSync(pidFile, "999999999");

    expect(hb.isHeartbeatRunning()).toBe(false);
  });

  it("returns true for a live process (current PID)", async () => {
    const cfg = await freshConfig();
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const hb = await import("../src/heartbeat.js");

    mkdirSync(cfg.BOTSYNC_DIR, { recursive: true });
    const pidFile = join(cfg.BOTSYNC_DIR, "heartbeat.pid");
    writeFileSync(pidFile, String(process.pid));

    expect(hb.isHeartbeatRunning()).toBe(true);
  });
});
