/**
 * botsync-relay — Cloudflare Worker for ephemeral pairing + network dashboard.
 *
 * Pairing endpoints:
 *   POST /pair          — store a device ID, get back a 4-word code
 *   GET  /pair/:code    — retrieve the device ID, delete it (one-time use)
 *
 * Network endpoints:
 *   POST /network/:id/heartbeat — device registers/updates itself
 *   GET  /network/:id/devices   — returns device list for dashboard
 *
 * Device IDs are stored in Cloudflare KV with TTLs.
 * No persistence, no accounts, no tracking.
 */

export interface Env {
  PAIRS: KVNamespace;
  NETWORKS: KVNamespace;
  CORS_ORIGIN: string;
}

import { generateCode, isValidCode } from "./words.js";

/** Device info stored per heartbeat */
interface DeviceInfo {
  deviceId: string;     // short Syncthing ID (7-char)
  name: string;         // hostname or user-set name
  os: string;           // darwin, linux, win32
  lastSeen: string;     // ISO timestamp
  version: string;      // botsync version
}

/** CORS headers for cross-origin requests. */
function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** KV key for a device in a network */
function deviceKey(networkId: string, deviceId: string): string {
  return `net:${networkId}:dev:${deviceId}`;
}

/** KV key prefix for listing devices in a network */
function networkPrefix(networkId: string): string {
  return `net:${networkId}:dev:`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ── Pairing ──────────────────────────────────────────────

    // POST /pair — create a pairing code
    if (request.method === "POST" && url.pathname === "/pair") {
      try {
        const body = (await request.json()) as { deviceId?: string };
        if (!body.deviceId || typeof body.deviceId !== "string") {
          return Response.json(
            { error: "deviceId required" },
            { status: 400, headers: cors }
          );
        }

        const cleaned = body.deviceId.replace(/-/g, "");
        if (cleaned.length < 40) {
          return Response.json(
            { error: "invalid deviceId format" },
            { status: 400, headers: cors }
          );
        }

        let code: string;
        let attempts = 0;
        do {
          code = generateCode();
          const existing = await env.PAIRS.get(code);
          if (!existing) break;
          attempts++;
        } while (attempts < 5);

        if (attempts >= 5) {
          return Response.json(
            { error: "code generation failed, try again" },
            { status: 500, headers: cors }
          );
        }

        await env.PAIRS.put(code, body.deviceId, { expirationTtl: 600 });
        return Response.json({ code }, { status: 201, headers: cors });
      } catch {
        return Response.json(
          { error: "invalid request body" },
          { status: 400, headers: cors }
        );
      }
    }

    // GET /pair/:code — retrieve and delete
    if (request.method === "GET" && url.pathname.startsWith("/pair/")) {
      const code = url.pathname.slice("/pair/".length);

      if (!isValidCode(code)) {
        return Response.json(
          { error: "invalid code format" },
          { status: 400, headers: cors }
        );
      }

      const deviceId = await env.PAIRS.get(code);
      if (!deviceId) {
        return Response.json(
          { error: "code not found or expired" },
          { status: 404, headers: cors }
        );
      }

      await env.PAIRS.delete(code);
      return Response.json({ deviceId }, { headers: cors });
    }

    // ── Network / Dashboard ──────────────────────────────────

    // POST /network/:id/heartbeat — device checks in
    const heartbeatMatch = url.pathname.match(/^\/network\/([a-zA-Z0-9_-]+)\/heartbeat$/);
    if (request.method === "POST" && heartbeatMatch) {
      const networkId = heartbeatMatch[1];

      try {
        const body = (await request.json()) as Partial<DeviceInfo>;

        if (!body.deviceId || typeof body.deviceId !== "string") {
          return Response.json(
            { error: "deviceId required" },
            { status: 400, headers: cors }
          );
        }

        const device: DeviceInfo = {
          deviceId: body.deviceId.slice(0, 7),
          name: (body.name || "unknown").slice(0, 64),
          os: (body.os || "unknown").slice(0, 32),
          lastSeen: new Date().toISOString(),
          version: (body.version || "0.0.0").slice(0, 16),
        };

        // Store with 5-minute TTL — stale devices auto-expire
        const key = deviceKey(networkId, device.deviceId);
        await env.NETWORKS.put(key, JSON.stringify(device), {
          expirationTtl: 300,
        });

        return Response.json({ ok: true }, { headers: cors });
      } catch {
        return Response.json(
          { error: "invalid request body" },
          { status: 400, headers: cors }
        );
      }
    }

    // GET /network/:id/devices — list devices in a network
    const devicesMatch = url.pathname.match(/^\/network\/([a-zA-Z0-9_-]+)\/devices$/);
    if (request.method === "GET" && devicesMatch) {
      const networkId = devicesMatch[1];
      const prefix = networkPrefix(networkId);

      const list = await env.NETWORKS.list({ prefix });
      const devices: DeviceInfo[] = [];

      for (const key of list.keys) {
        const val = await env.NETWORKS.get(key.name);
        if (val) {
          try {
            devices.push(JSON.parse(val));
          } catch {
            // skip corrupt entries
          }
        }
      }

      // Sort by lastSeen descending
      devices.sort(
        (a, b) =>
          new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      );

      return Response.json({ networkId, devices, count: devices.length }, { headers: cors });
    }

    // Health check
    if (url.pathname === "/") {
      return Response.json(
        { status: "ok", service: "botsync-relay" },
        { headers: cors }
      );
    }

    return Response.json(
      { error: "not found" },
      { status: 404, headers: cors }
    );
  },
};
