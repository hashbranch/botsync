/**
 * folders.test.ts - Unit tests for custom folder management.
 *
 * All Syncthing API calls are mocked via vi.stubGlobal("fetch"). A temp
 * BOTSYNC_ROOT is used with a hand-written config.json so the apiCall
 * helper finds an apiKey + apiPort without touching the real sync dir.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

let tmpRoot: string;

/**
 * Reset module graph + restore globals + create a fresh BOTSYNC_ROOT with a
 * valid config.json. Needed because config paths are captured at module load
 * time, so we must re-import after setting the env var.
 */
async function freshModules() {
  vi.resetModules();
  process.env.BOTSYNC_ROOT = tmpRoot;
  const cfg = await import("../src/config.js");
  mkdirSync(cfg.BOTSYNC_DIR, { recursive: true });
  cfg.writeConfig({ apiKey: "k", apiPort: 12345, deviceId: "MY-DEVICE-ID" });
  const folders = await import("../src/folders.js");
  return { cfg, folders };
}

/**
 * Build a fetch mock that routes by method + URL substring. The handler is
 * a list of `{ match, respond }` entries evaluated in order. The first match
 * wins. Unmatched requests throw so tests fail loudly on unexpected traffic.
 */
function mockFetch(handlers: Array<{
  match: (method: string, url: string, body?: unknown) => boolean;
  respond: (method: string, url: string, body?: unknown) => { status?: number; body?: unknown };
}>) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const bodyRaw = init?.body;
    const body = typeof bodyRaw === "string" && bodyRaw.length > 0 ? JSON.parse(bodyRaw) : undefined;
    calls.push({ method, url, body });

    for (const h of handlers) {
      if (h.match(method, url, body)) {
        const r = h.respond(method, url, body);
        const status = r.status ?? 200;
        const respBody = r.body === undefined ? "" : JSON.stringify(r.body);
        return {
          ok: status >= 200 && status < 300,
          status,
          text: async () => respBody,
        } as unknown as Response;
      }
    }
    throw new Error(`Unmocked fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", impl);
  return { impl, calls };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "botsync-folders-"));
  process.env.BOTSYNC_ROOT = tmpRoot;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.BOTSYNC_ROOT;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe("validateFolderName", () => {
  it("accepts simple lowercase names", async () => {
    const { folders } = await freshModules();
    expect(() => folders.validateFolderName("tera")).not.toThrow();
    expect(() => folders.validateFolderName("deal-data-2026")).not.toThrow();
    expect(() => folders.validateFolderName("gpu123")).not.toThrow();
  });

  it("rejects empty or whitespace", async () => {
    const { folders } = await freshModules();
    expect(() => folders.validateFolderName("")).toThrow();
    expect(() => folders.validateFolderName("   ")).toThrow();
  });

  it("rejects slashes and path separators", async () => {
    const { folders } = await freshModules();
    expect(() => folders.validateFolderName("foo/bar")).toThrow();
    expect(() => folders.validateFolderName("foo\\bar")).toThrow();
    expect(() => folders.validateFolderName("../evil")).toThrow();
  });

  it("rejects dot-prefixed names", async () => {
    const { folders } = await freshModules();
    expect(() => folders.validateFolderName(".secret")).toThrow();
    expect(() => folders.validateFolderName(".botsync")).toThrow();
  });

  it("rejects reserved names (current default + deprecated)", async () => {
    const { folders } = await freshModules();
    for (const reserved of ["shared", "inbox", "deliverables", "botsync"]) {
      expect(() => folders.validateFolderName(reserved)).toThrow(/reserved/i);
    }
  });

  it("rejects names longer than 64 characters", async () => {
    const { folders } = await freshModules();
    expect(() => folders.validateFolderName("a".repeat(65))).toThrow();
    expect(() => folders.validateFolderName("a".repeat(64))).not.toThrow();
  });

  it("rejects uppercase and special characters", async () => {
    const { folders } = await freshModules();
    expect(() => folders.validateFolderName("TERA")).toThrow();
    expect(() => folders.validateFolderName("deal space")).toThrow();
    expect(() => folders.validateFolderName("deal@work")).toThrow();
  });
});

describe("folderIdFor / nameForFolderId / isDefaultFolder", () => {
  it("round-trips the name through the id helpers", async () => {
    const { folders } = await freshModules();
    expect(folders.folderIdFor("tera")).toBe("botsync-tera");
    expect(folders.nameForFolderId("botsync-tera")).toBe("tera");
  });

  it("marks shared as the default folder", async () => {
    const { folders } = await freshModules();
    expect(folders.isDefaultFolder("botsync-shared")).toBe(true);
    expect(folders.isDefaultFolder("botsync-tera")).toBe(false);
  });
});

describe("resolveFolderPath", () => {
  it("defaults to <SYNC_DIR>/<name>", async () => {
    const { cfg, folders } = await freshModules();
    expect(folders.resolveFolderPath("tera")).toBe(join(cfg.SYNC_DIR, "tera"));
  });

  it("respects an absolute override", async () => {
    const { folders } = await freshModules();
    const abs = join(tmpRoot, "somewhere-else");
    expect(folders.resolveFolderPath("tera", abs)).toBe(abs);
  });

  it("expands a leading tilde to homedir", async () => {
    const { folders } = await freshModules();
    const expanded = folders.resolveFolderPath("tera", "~/custom");
    expect(expanded.startsWith(homedir())).toBe(true);
    expect(expanded.endsWith("/custom")).toBe(true);
  });
});

describe("addFolder", () => {
  it("creates the folder via PUT /rest/config/folders and shares with peers", async () => {
    const { folders } = await freshModules();
    const { calls } = mockFetch([
      // Current Syncthing config - one existing folder, one paired peer, plus our own device.
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [
              { deviceID: "MY-DEVICE-ID" },
              { deviceID: "PEER-ABC-XYZ" },
            ],
            folders: [
              { id: "botsync-shared", path: "/sync/shared", type: "sendreceive", devices: [] },
            ],
          },
        }),
      },
      { match: (m, u) => m === "POST" && u.includes("/rest/config/folders"), respond: () => ({ body: {} }) },
    ]);

    const teraPath = join(tmpRoot, "tera");
    const result = await folders.addFolder({
      name: "tera",
      path: teraPath,
      type: "sendreceive",
    });

    expect(result.id).toBe("botsync-tera");
    expect(result.path).toBe(teraPath);
    expect(result.devices).toContain("PEER-ABC-XYZ");
    expect(result.devices).toContain("MY-DEVICE-ID");

    // Verify the POST payload matches what Syncthing expects.
    const put = calls.find((c) => c.method === "POST" && c.url.includes("/rest/config/folders"));
    expect(put).toBeTruthy();
    const payload = put!.body as {
      id: string; path: string; type: string; label: string;
      devices: Array<{ deviceID: string }>;
    };
    expect(payload.id).toBe("botsync-tera");
    expect(payload.path).toBe(teraPath);
    expect(payload.type).toBe("sendreceive");
    expect(payload.label).toBe("botsync-tera");
    const ids = payload.devices.map((d) => d.deviceID).sort();
    expect(ids).toEqual(["MY-DEVICE-ID", "PEER-ABC-XYZ"].sort());
  });

  it("rejects reserved names before any API call", async () => {
    const { folders } = await freshModules();
    const { impl } = mockFetch([]); // no handlers, any call throws
    await expect(
      folders.addFolder({ name: "shared", path: "/tmp/x", type: "sendreceive" }),
    ).rejects.toThrow(/reserved/i);
    expect(impl).not.toHaveBeenCalled();
  });

  it("rejects creating a folder that already exists", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }],
            folders: [{ id: "botsync-tera", path: "/sync/tera", type: "sendreceive", devices: [] }],
          },
        }),
      },
    ]);
    await expect(
      folders.addFolder({ name: "tera", path: "/sync/tera", type: "sendreceive" }),
    ).rejects.toThrow(/already exists/i);
  });

  it("honours an explicit --devices list and filters unknown peers", async () => {
    const { folders } = await freshModules();
    const { calls } = mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [
              { deviceID: "MY-DEVICE-ID" },
              { deviceID: "PEER-ABC" },
              { deviceID: "PEER-XYZ" },
            ],
            folders: [],
          },
        }),
      },
      { match: (m, u) => m === "POST", respond: () => ({ body: {} }) },
    ]);

    await folders.addFolder({
      name: "tera",
      path: join(tmpRoot, "tera"),
      type: "sendreceive",
      devices: ["PEER-ABC"], // only this one, not PEER-XYZ
    });

    const put = calls.find((c) => c.method === "POST" && c.url.includes("/rest/config/folders"));
    const payload = put!.body as { devices: Array<{ deviceID: string }> };
    const ids = payload.devices.map((d) => d.deviceID).sort();
    // Own device always included; PEER-XYZ excluded.
    expect(ids).toEqual(["MY-DEVICE-ID", "PEER-ABC"].sort());
  });

  it("throws if the caller passes a device id that is not paired", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }, { deviceID: "PEER-ABC" }],
            folders: [],
          },
        }),
      },
    ]);
    await expect(
      folders.addFolder({
        name: "tera",
        path: "/sync/tera",
        type: "sendreceive",
        devices: ["PEER-ABC", "UNKNOWN-PEER"],
        strictDevices: true,
      }),
    ).rejects.toThrow(/not paired|unknown/i);
  });

  it("creates the local directory when it does not exist", async () => {
    const { folders } = await freshModules();
    const missingPath = join(tmpRoot, "brand-new-folder");
    expect(existsSync(missingPath)).toBe(false);
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({ body: { devices: [{ deviceID: "MY-DEVICE-ID" }], folders: [] } }),
      },
      { match: (m, u) => m === "POST", respond: () => ({ body: {} }) },
    ]);
    await folders.addFolder({ name: "tera", path: missingPath, type: "sendreceive" });
    expect(existsSync(missingPath)).toBe(true);
  });
});

describe("listFolders", () => {
  it("returns only botsync-* folders with default vs custom flag", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }, { deviceID: "PEER-ABC" }],
            folders: [
              { id: "botsync-shared", path: "/s/shared", type: "sendreceive", devices: [{ deviceID: "PEER-ABC" }] },
              { id: "botsync-tera", path: "/s/tera", type: "sendreceive", devices: [{ deviceID: "PEER-ABC" }] },
              { id: "unrelated-folder", path: "/other", type: "sendreceive", devices: [] },
            ],
          },
        }),
      },
      {
        // Per-folder status endpoint (/rest/db/status?folder=...)
        match: (m, u) => m === "GET" && u.includes("/rest/db/status"),
        respond: (_m, u) => ({
          body: {
            state: u.includes("botsync-tera") ? "syncing" : "idle",
            needFiles: u.includes("botsync-tera") ? 3 : 0,
            globalFiles: 10,
          },
        }),
      },
    ]);

    const list = await folders.listFolders();
    expect(list).toHaveLength(2);
    const ids = list.map((f) => f.id).sort();
    expect(ids).toEqual(["botsync-shared", "botsync-tera"]);

    const shared = list.find((f) => f.id === "botsync-shared")!;
    expect(shared.isDefault).toBe(true);
    expect(shared.deviceCount).toBe(1);
    expect(shared.synced).toBe(true);

    const tera = list.find((f) => f.id === "botsync-tera")!;
    expect(tera.isDefault).toBe(false);
    expect(tera.synced).toBe(false);
    expect(tera.state).toBe("syncing");
  });
});

describe("removeFolder", () => {
  it("sends DELETE to /rest/config/folders/<id>", async () => {
    const { folders } = await freshModules();
    const { calls } = mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }],
            folders: [{ id: "botsync-tera", path: "/s/tera", type: "sendreceive", devices: [] }],
          },
        }),
      },
      { match: (m, u) => m === "DELETE", respond: () => ({ body: {} }) },
    ]);

    await folders.removeFolder("tera");
    const del = calls.find((c) => c.method === "DELETE");
    expect(del).toBeTruthy();
    expect(del!.url).toContain("/rest/config/folders/botsync-tera");
  });

  it("refuses to remove the default shared folder", async () => {
    const { folders } = await freshModules();
    mockFetch([]); // never called
    await expect(folders.removeFolder("shared")).rejects.toThrow();
  });

  it("throws if the folder is not registered", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }],
            folders: [],
          },
        }),
      },
    ]);
    await expect(folders.removeFolder("tera")).rejects.toThrow(/not found/i);
  });
});

describe("shareFolder / unshareFolder", () => {
  it("shareFolder adds the device to the folder's device list", async () => {
    const { folders } = await freshModules();
    const { calls } = mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }, { deviceID: "PEER-NEW" }],
            folders: [{ id: "botsync-tera", path: "/s/tera", type: "sendreceive", devices: [] }],
          },
        }),
      },
      { match: (m, u) => m === "PUT" && u.includes("/rest/config"), respond: () => ({ body: {} }) },
    ]);

    await folders.shareFolder("tera", "PEER-NEW");
    const put = calls.find((c) => c.method === "PUT");
    const payload = put!.body as { folders: Array<{ id: string; devices: Array<{ deviceID: string }> }> };
    const tera = payload.folders.find((f) => f.id === "botsync-tera");
    expect(tera!.devices.map((d) => d.deviceID)).toContain("PEER-NEW");
  });

  it("shareFolder rejects peers that are not paired", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }],
            folders: [{ id: "botsync-tera", path: "/s/tera", type: "sendreceive", devices: [] }],
          },
        }),
      },
    ]);
    await expect(folders.shareFolder("tera", "STRANGER")).rejects.toThrow(/not paired/i);
  });

  it("unshareFolder removes the device from the folder", async () => {
    const { folders } = await freshModules();
    const { calls } = mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }, { deviceID: "PEER-ABC" }],
            folders: [{
              id: "botsync-tera",
              path: "/s/tera",
              type: "sendreceive",
              devices: [{ deviceID: "PEER-ABC" }],
            }],
          },
        }),
      },
      { match: (m, u) => m === "PUT", respond: () => ({ body: {} }) },
    ]);

    await folders.unshareFolder("tera", "PEER-ABC");
    const put = calls.find((c) => c.method === "PUT");
    const payload = put!.body as { folders: Array<{ id: string; devices: Array<{ deviceID: string }> }> };
    const tera = payload.folders.find((f) => f.id === "botsync-tera");
    expect(tera!.devices.map((d) => d.deviceID)).not.toContain("PEER-ABC");
  });

  it("unshareFolder is a no-op when the device was not sharing the folder", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [{ deviceID: "MY-DEVICE-ID" }, { deviceID: "PEER-ABC" }],
            folders: [{ id: "botsync-tera", path: "/s/tera", type: "sendreceive", devices: [] }],
          },
        }),
      },
    ]);
    // Should not throw - nothing to do, and no PUT is issued.
    await expect(folders.unshareFolder("tera", "PEER-ABC")).resolves.toBeUndefined();
  });
});

describe("getPairedDevices", () => {
  it("returns every device except our own", async () => {
    const { folders } = await freshModules();
    mockFetch([
      {
        match: (m, u) => m === "GET" && u.includes("/rest/config"),
        respond: () => ({
          body: {
            devices: [
              { deviceID: "MY-DEVICE-ID" },
              { deviceID: "PEER-A" },
              { deviceID: "PEER-B" },
            ],
            folders: [],
          },
        }),
      },
    ]);
    const peers = await folders.getPairedDevices();
    expect(peers.sort()).toEqual(["PEER-A", "PEER-B"]);
  });
});
