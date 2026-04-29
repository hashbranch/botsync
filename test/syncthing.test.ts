/**
 * syncthing.test.ts — Tests for config generation, stale cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generateConfig } from "../src/syncthing.js";

describe("generateConfig", () => {
  it("produces XML with correct API key and port", () => {
    const xml = generateConfig("my-api-key-123", 28000);
    expect(xml).toContain("<apikey>my-api-key-123</apikey>");
    expect(xml).toContain("127.0.0.1:28000");
  });

  it("includes the botsync-shared folder ID", () => {
    const xml = generateConfig("key", 9999);
    expect(xml).toContain('id="botsync-shared"');
  });

  it("disables auto-upgrade", () => {
    const xml = generateConfig("key", 9999);
    expect(xml).toContain("<autoUpgradeIntervalH>0</autoUpgradeIntervalH>");
  });

  it("disables browser launch", () => {
    const xml = generateConfig("key", 9999);
    expect(xml).toContain("<startBrowser>false</startBrowser>");
  });

  it("enables autoAcceptFolders in defaults", () => {
    const xml = generateConfig("key", 9999);
    expect(xml).toContain("<autoAcceptFolders>true</autoAcceptFolders>");
  });

  it("sets a default folder path under SYNC_DIR with %FOLDERID% token", async () => {
    // Auto-accepted folders should land under our managed sync root, not at
    // Syncthing's compiled-in default (~/<folderID>/). Otherwise a peer adding
    // a new folder via `botsync folder share` lands at the wrong path on
    // anyone who hadn't pre-created it.
    vi.resetModules();
    const tmp = mkdtempSync(join(tmpdir(), "botsync-defaults-"));
    process.env.BOTSYNC_ROOT = tmp;
    try {
      const { generateConfig: gen } = await import("../src/syncthing.js");
      const xml = gen("key", 9999);
      expect(xml).toContain(`path="${tmp}/%FOLDERID%"`);
      // The default should be inside a <defaults> block (not the
      // botsync-shared folder definition above it).
      const defaultsIdx = xml.indexOf("<defaults>");
      const tokenIdx = xml.indexOf("%FOLDERID%");
      expect(defaultsIdx).toBeGreaterThan(-1);
      expect(tokenIdx).toBeGreaterThan(defaultsIdx);
    } finally {
      delete process.env.BOTSYNC_ROOT;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("cleanupStale", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "botsync-stale-"));
    process.env.BOTSYNC_ROOT = tmpRoot;
  });

  afterEach(() => {
    delete process.env.BOTSYNC_ROOT;
    if (tmpRoot && existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("handles missing PID file gracefully", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const { cleanupStale } = await import("../src/syncthing.js");
    expect(() => cleanupStale()).not.toThrow();
  });

  it("removes stale PID file", async () => {
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const cfg = await import("../src/config.js");
    vi.resetModules();
    process.env.BOTSYNC_ROOT = tmpRoot;
    const { cleanupStale } = await import("../src/syncthing.js");

    mkdirSync(cfg.BOTSYNC_DIR, { recursive: true });
    writeFileSync(cfg.PID_FILE, "999999999");

    cleanupStale();
    expect(existsSync(cfg.PID_FILE)).toBe(false);
  });
});
