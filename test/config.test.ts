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

describe("webhook config", () => {
  it("round-trips webhookToken and webhookUrl", async () => {
    const cfg = await freshImport();
    const data = {
      apiKey: "key-1",
      apiPort: 27500,
      webhookToken: "tok-abc",
      webhookUrl: "http://localhost:18789/hooks/agent",
    };
    cfg.writeConfig(data);
    const read = cfg.readConfig();
    expect(read?.webhookToken).toBe("tok-abc");
    expect(read?.webhookUrl).toBe("http://localhost:18789/hooks/agent");
  });

  it("preserves existing fields when adding webhook config", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "key-1", apiPort: 27500, deviceId: "DEV-1" });
    cfg.writeConfig({
      ...cfg.readConfig()!,
      webhookToken: "tok-new",
    });
    const read = cfg.readConfig();
    expect(read?.apiKey).toBe("key-1");
    expect(read?.apiPort).toBe(27500);
    expect(read?.deviceId).toBe("DEV-1");
    expect(read?.webhookToken).toBe("tok-new");
  });
});

describe("persistWebhookConfig", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_HOOKS_TOKEN;
    delete process.env.OPENCLAW_HOOKS_URL;
  });

  it("is a no-op when OPENCLAW_HOOKS_TOKEN is not set", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "k", apiPort: 1234 });
    cfg.persistWebhookConfig();
    const read = cfg.readConfig();
    expect(read?.webhookToken).toBeUndefined();
  });

  it("is a no-op when no config exists", async () => {
    const cfg = await freshImport();
    process.env.OPENCLAW_HOOKS_TOKEN = "tok-1";
    // Should not throw — gracefully returns
    cfg.persistWebhookConfig();
    expect(cfg.readConfig()).toBeNull();
  });

  it("persists token from env var into config", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "k", apiPort: 1234 });
    process.env.OPENCLAW_HOOKS_TOKEN = "tok-from-env";
    cfg.persistWebhookConfig();
    const read = cfg.readConfig();
    expect(read?.webhookToken).toBe("tok-from-env");
  });

  it("persists both token and URL from env vars", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "k", apiPort: 1234 });
    process.env.OPENCLAW_HOOKS_TOKEN = "tok-1";
    process.env.OPENCLAW_HOOKS_URL = "http://custom:9999/hooks";
    cfg.persistWebhookConfig();
    const read = cfg.readConfig();
    expect(read?.webhookToken).toBe("tok-1");
    expect(read?.webhookUrl).toBe("http://custom:9999/hooks");
  });

  it("does not overwrite when values are unchanged", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "k", apiPort: 1234, webhookToken: "tok-1" });
    process.env.OPENCLAW_HOOKS_TOKEN = "tok-1";

    // Get the mtime before
    const statsBefore = statSync(cfg.CONFIG_FILE);
    // Small delay to ensure mtime would change if file is rewritten
    await new Promise((r) => setTimeout(r, 50));

    cfg.persistWebhookConfig();
    const statsAfter = statSync(cfg.CONFIG_FILE);
    // File should NOT have been rewritten since values are the same
    expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
  });

  it("updates when token changes", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({ apiKey: "k", apiPort: 1234, webhookToken: "old-tok" });
    process.env.OPENCLAW_HOOKS_TOKEN = "new-tok";
    cfg.persistWebhookConfig();
    const read = cfg.readConfig();
    expect(read?.webhookToken).toBe("new-tok");
    expect(read?.apiKey).toBe("k"); // existing fields preserved
  });

  it("does not clobber existing webhook URL when only token env var is set", async () => {
    const cfg = await freshImport();
    cfg.writeConfig({
      apiKey: "k",
      apiPort: 1234,
      webhookToken: "old-tok",
      webhookUrl: "http://existing:8080/hooks",
    });
    process.env.OPENCLAW_HOOKS_TOKEN = "new-tok";
    // OPENCLAW_HOOKS_URL is NOT set
    cfg.persistWebhookConfig();
    const read = cfg.readConfig();
    expect(read?.webhookToken).toBe("new-tok");
    expect(read?.webhookUrl).toBe("http://existing:8080/hooks"); // preserved
  });
});
