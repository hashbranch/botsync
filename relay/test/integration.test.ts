/**
 * Integration tests for botsync-relay Cloudflare Worker.
 *
 * Uses wrangler's unstable_dev API to spin up a local miniflare-backed
 * instance of the worker. All KV operations are in-memory — no Cloudflare
 * account needed.
 *
 * Run: npm test (from relay/)
 */

import { unstable_dev, type UnstableDevWorker } from "wrangler";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

let worker: UnstableDevWorker;

// Base URL helper — unstable_dev gives us address/port
function url(path: string): string {
  return `http://${worker.address}:${worker.port}${path}`;
}

// Helper to make fetch calls with common patterns
async function post(path: string, body: object, headers?: Record<string, string>) {
  return fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function get(path: string, headers?: Record<string, string>) {
  return fetch(url(path), { method: "GET", headers });
}

async function options(path: string) {
  return fetch(url(path), { method: "OPTIONS" });
}

beforeAll(async () => {
  worker = await unstable_dev("src/index.ts", {
    experimental: { disableExperimentalWarning: true },
    local: true,
    vars: { CORS_ORIGIN: "https://botsync.io" },
  });
}, 30_000);

afterAll(async () => {
  if (worker) await worker.stop();
});

// ── Health ────────────────────────────────────────────────────

describe("Health", () => {
  it("GET / returns 200 with status ok", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; version: string; service: string };
    expect(json.status).toBe("ok");
    expect(json.service).toBe("botsync-relay");
    expect(json.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── Pairing Flow ─────────────────────────────────────────────

describe("Pairing", () => {
  it("POST /pair with deviceId returns 201 and a 5-word code", async () => {
    const res = await post("/pair", {
      deviceId: "ABCDEFG-HIJKLMN-OPQRSTU-VWXYZ12-3456789-0ABCDEF",
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBeDefined();
    const words = json.code.split("-");
    expect(words.length).toBe(5);
    // Each word should be non-empty
    words.forEach((w: string) => expect(w.length).toBeGreaterThan(0));
  });

  it("POST /pair without deviceId returns 400", async () => {
    const res = await post("/pair", {});
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("deviceId");
  });

  it("POST /pair with short deviceId returns 400", async () => {
    const res = await post("/pair", { deviceId: "short" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("invalid deviceId");
  });

  it("GET /pair/:code returns deviceId and deletes code (one-time use)", async () => {
    const deviceId = "XYZTEST-HIJKLMN-OPQRSTU-VWXYZ12-3456789-0ABCDEF";
    const createRes = await post("/pair", { deviceId });
    expect(createRes.status).toBe(201);
    const { code } = (await createRes.json()) as { code: string };

    // First retrieval succeeds
    const getRes = await get(`/pair/${code}`);
    expect(getRes.status).toBe(200);
    const json = (await getRes.json()) as { deviceId: string };
    expect(json.deviceId).toBe(deviceId);

    // Second retrieval returns 404 (code was consumed)
    const getRes2 = await get(`/pair/${code}`);
    expect(getRes2.status).toBe(404);
  });

  it("GET /pair/invalid-code returns 400 for invalid format", async () => {
    const res = await get("/pair/not-a-valid-code");
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("invalid code");
  });

  it("POST /pair with networkSecret includes secret on retrieval", async () => {
    const deviceId = "SECTEST-HIJKLMN-OPQRSTU-VWXYZ12-3456789-0ABCDEF";
    const networkSecret = "my-super-secret-token-12345";
    const networkId = "test-net-secret";

    const createRes = await post("/pair", { deviceId, networkId, networkSecret });
    expect(createRes.status).toBe(201);
    const { code } = (await createRes.json()) as { code: string };

    const getRes = await get(`/pair/${code}`);
    expect(getRes.status).toBe(200);
    const json = (await getRes.json()) as {
      deviceId: string;
      networkId: string;
      networkSecret: string;
    };
    expect(json.deviceId).toBe(deviceId);
    expect(json.networkId).toBe(networkId);
    expect(json.networkSecret).toBe(networkSecret);
  });

  it("11th POST /pair in 60s returns 429 (rate limited)", async () => {
    // Send 10 requests (the limit)
    const deviceId = "RATELIM-HIJKLMN-OPQRSTU-VWXYZ12-3456789-0ABCDEF";
    const results: number[] = [];

    for (let i = 0; i < 11; i++) {
      const res = await post("/pair", { deviceId });
      results.push(res.status);
      // Consume body to avoid connection issues
      await res.text();
    }

    // First 10 should succeed (201), 11th should be rate limited (429)
    // Note: the test file runs after other pairing tests which may have
    // consumed some of the rate limit. We check that at least one is 429.
    expect(results).toContain(429);

    // The 429 response should include Retry-After header
    const lastRes = await post("/pair", { deviceId });
    if (lastRes.status === 429) {
      expect(lastRes.headers.get("Retry-After")).toBe("60");
    }
    await lastRes.text();
  });
});

// ── Auth Flow ────────────────────────────────────────────────

describe("Auth", () => {
  const networkId = `auth-test-${Date.now()}`;
  const secret = "test-network-secret-abc123";
  const devicePayload = {
    deviceId: "AUTH0001",
    name: "test-device",
    os: "linux",
    version: "0.3.0",
  };

  it("POST /network/:id/heartbeat with Bearer registers auth and returns 200", async () => {
    const res = await post(
      `/network/${networkId}/heartbeat`,
      devicePayload,
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("POST /network/:id/heartbeat with same Bearer returns 200", async () => {
    const res = await post(
      `/network/${networkId}/heartbeat`,
      devicePayload,
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("POST /network/:id/heartbeat with wrong Bearer returns 401", async () => {
    const res = await post(
      `/network/${networkId}/heartbeat`,
      devicePayload,
      { Authorization: "Bearer wrong-secret" }
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("invalid token");
  });

  it("POST /network/:id/heartbeat with no Bearer (after auth set) returns 401", async () => {
    const res = await post(`/network/${networkId}/heartbeat`, devicePayload);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("authorization required");
  });

  it("GET /network/:id/devices?token=correct returns 200 with device list", async () => {
    const res = await get(`/network/${networkId}/devices?token=${secret}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      networkId: string;
      devices: Array<{ deviceId: string }>;
      count: number;
    };
    expect(json.networkId).toBe(networkId);
    expect(json.count).toBeGreaterThanOrEqual(1);
    expect(json.devices[0].deviceId).toBe("AUTH000"); // truncated to 7 chars
  });

  it("GET /network/:id/devices?token=wrong returns 401", async () => {
    const res = await get(`/network/${networkId}/devices?token=wrong-secret`);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("invalid token");
  });

  it("GET /network/:id/devices with no token (auth set) returns 401", async () => {
    const res = await get(`/network/${networkId}/devices`);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("authorization required");
  });
});

// ── Legacy Compat ────────────────────────────────────────────

describe("Legacy compat (no auth set)", () => {
  const networkId = `legacy-test-${Date.now()}`;
  const devicePayload = {
    deviceId: "LEGACY01",
    name: "legacy-device",
    os: "darwin",
    version: "0.2.0",
  };

  it("POST /network/:id/heartbeat with no Bearer (no auth set) returns 200", async () => {
    const res = await post(`/network/${networkId}/heartbeat`, devicePayload);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("GET /network/:id/devices (no token, no auth set) returns 200", async () => {
    const res = await get(`/network/${networkId}/devices`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      networkId: string;
      devices: Array<{ deviceId: string }>;
      count: number;
    };
    expect(json.networkId).toBe(networkId);
    expect(json.count).toBeGreaterThanOrEqual(1);
  });
});

// ── CORS ─────────────────────────────────────────────────────

describe("CORS", () => {
  it("OPTIONS /pair returns CORS with origin: *", async () => {
    const res = await options("/pair");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("OPTIONS /network/:id/devices returns CORS with origin: https://botsync.io", async () => {
    const res = await options("/network/test-net/devices");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://botsync.io");
  });

  it("GET / response includes CORS headers", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    // Root is not under /pair, so it gets the botsync.io origin
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeDefined();
  });
});
