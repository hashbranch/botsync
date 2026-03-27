/**
 * config.test.ts — Tests for config read/write, network ID, network secret.
 * Uses temp dirs via BOTSYNC_ROOT env var to avoid touching real ~/sync/.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, statSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

async function freshImport() {
  vi.resetModules();
  return await import("../src/config.js");
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-test-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe("config read/write", () => {
  it("returns null when no config exists", async () => {
    const cfg = await freshImport();
    expect(cfg.readConfig()).toBeNull();
  });

  it("round-trips config data", async () => {
    const cfg = await freshImport();
    const data = { apiKey: "test-key-123", apiPort: 27500, deviceId: "DEVICE-ABC" };
    cfg.writeConfig(data);
    const read = cfg.readConfig();
    expect(read).toEqual(data);
  });

  it("sets 0o600 permissions on config.json", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "k", apiPort: 1234 });
    const stats = statSync(cfg.CONFIG_FILE);
    expect(stats.mode & 0o777).toBe(0o600);
  });
});

describe("network ID", () => {
  it("returns null when no network file exists", async () => {
    const cfg = await freshImport();
    expect(cfg.readNetworkId()).toBeNull();
  });

  it("round-trips network ID", async () => {
    const cfg = await freshImport();
    cfg.writeNetworkId("net-abc-123");
    expect(cfg.readNetworkId()).toBe("net-abc-123");
  });

  it("sets 0o600 permissions on network.json", async () => {
    const cfg = await freshImport();
    cfg.writeNetworkId("net-xyz");
    const stats = statSync(cfg.NETWORK_FILE);
    expect(stats.mode & 0o777).toBe(0o600);
  });
});

describe("network secret", () => {
  it("returns null when no secret exists", async () => {
    const cfg = await freshImport();
    expect(cfg.readNetworkSecret()).toBeNull();
  });

  it("round-trips network secret", async () => {
    const cfg = await freshImport();
    cfg.writeNetworkId("net-1");
    cfg.writeNetworkSecret("secret-abc");
    expect(cfg.readNetworkSecret()).toBe("secret-abc");
  });

  it("preserves network ID when writing secret", async () => {
    const cfg = await freshImport();
    cfg.writeNetworkId("net-1");
    cfg.writeNetworkSecret("secret-abc");
    expect(cfg.readNetworkId()).toBe("net-1");
  });

  it("preserves secret when writing network ID", async () => {
    const cfg = await freshImport();
    cfg.writeNetworkId("net-1");
    cfg.writeNetworkSecret("secret-abc");
    cfg.writeNetworkId("net-2");
    expect(cfg.readNetworkSecret()).toBe("secret-abc");
    expect(cfg.readNetworkId()).toBe("net-2");
  });
});

describe("BOTSYNC_ROOT override", () => {
  it("uses custom root for all paths", async () => {
    const cfg = await freshImport();
    expect(cfg.SYNC_DIR).toBe(tmpRoot);
    expect(cfg.BOTSYNC_DIR).toBe(join(tmpRoot, ".botsync"));
  });
});
