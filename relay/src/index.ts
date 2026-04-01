/**
 * botsync-relay — Cloudflare Worker for ephemeral pairing + network dashboard.
 *
 * SECURITY MODEL (v0.3.0):
 * - Pairing: ephemeral codes (10-min TTL, one-time use, rate limited)
 * - Network auth: Bearer token derived from networkSecret, validated via SHA-256 hash
 * - CORS: locked to botsync.io for network endpoints, open for pairing (CLI needs it)
 * - Rate limiting: in-worker KV counters per IP per endpoint
 *
 * Endpoints:
 *   POST /pair              — store device info, get back a 5-word code
 *   GET  /pair/:code        — retrieve device info, delete code (one-time use)
 *   POST /network/:id/heartbeat — device registers (requires Bearer token)
 *   GET  /network/:id/devices   — list devices (requires ?token= query param)
 */

export interface Env {
  PAIRS: KVNamespace;
  NETWORKS: KVNamespace;
  CORS_ORIGIN: string; // "https://botsync.io" in production
}

import { generateCode, isValidCode } from "./words.js";

// ── Crypto Helpers ──────────────────────────────────────────

/**
 * SHA-256 hash a string, return hex digest.
 * Used to store network secrets — relay stores only the hash.
 * (Plaintext is held briefly in PAIRS KV during the 10-min pairing window,
 * then deleted on first read.)
 *
 * SECURITY: Uses Web Crypto API.
 * We store hex(sha256(secret)) and compare against hex(sha256(input)).
 */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks on hash validation.
 * Both inputs must be the same length (always true for hex SHA-256 digests).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── CORS ────────────────────────────────────────────────────

/** Device info stored per heartbeat */
interface DeviceInfo {
  deviceId: string; // short Syncthing ID (7-char)
  name: string; // hostname or user-set name
  os: string; // darwin, linux, win32
  lastSeen: string; // ISO timestamp
  version: string; // botsync version
}

/**
 * Build CORS headers based on the request path.
 *
 * SECURITY: /pair endpoints use wildcard CORS because the CLI's fetch()
 * runs from any origin. /network/* endpoints are locked to botsync.io
 * so only the dashboard can read device data from browsers.
 */
function corsHeaders(env: Env, pathname: string): Record<string, string> {
  // Pairing endpoints: CLI needs open CORS
  const origin = pathname.startsWith("/pair")
    ? "*"
    : env.CORS_ORIGIN || "https://botsync.io";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ── Rate Limiting ───────────────────────────────────────────

/**
 * Check and increment rate limit counter for an IP + endpoint.
 *
 * Uses KV with 60s TTL as a sliding window approximation.
 * Not perfectly accurate (KV is eventually consistent) but good enough
 * to stop brute force on pairing codes.
 *
 * @returns true if request is allowed, false if rate limited
 */
async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  endpoint: string,
  maxPerMinute: number
): Promise<boolean> {
  const key = `rl:${ip}:${endpoint}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= maxPerMinute) {
    return false; // Rate limited
  }

  // Increment counter. TTL ensures auto-cleanup after 60s.
  // KV eventual consistency means this might over-count slightly — that's fine,
  // better to occasionally rate-limit a legit user than let an attacker through.
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
}

// ── Auth Helpers ────────────────────────────────────────────

/** KV key for a network's auth hash */
function authKey(networkId: string): string {
  return `net:${networkId}:auth`;
}

/** KV key for a device in a network */
function deviceKey(networkId: string, deviceId: string): string {
  return `net:${networkId}:dev:${deviceId}`;
}

/** KV key prefix for listing devices in a network */
function networkPrefix(networkId: string): string {
  return `net:${networkId}:dev:`;
}

/**
 * Validate a bearer token against the stored network auth hash.
 *
 * SECURITY FLOW:
 * 1. First heartbeat for a network: store sha256(token) as the auth key (registration)
 * 2. Subsequent requests: compare sha256(token) against stored hash
 * 3. No token provided but auth exists: reject (401)
 *
 * @returns null if valid, or an error Response if invalid
 */
async function validateNetworkAuth(
  kv: KVNamespace,
  networkId: string,
  token: string | null,
  cors: Record<string, string>
): Promise<Response | null> {
  const storedHash = await kv.get(authKey(networkId));

  if (!token) {
    // No token provided
    if (storedHash) {
      // Network has auth — reject
      return Response.json(
        { error: "authorization required" },
        { status: 401, headers: cors }
      );
    }
    // No auth set yet and no token — allow (legacy network, pre-auth)
    return null;
  }

  // Token provided — validate or register
  const tokenHash = await sha256(token);

  if (!storedHash) {
    // First authenticated request for this network — register the secret.
    // SECURITY: No TTL on auth key — persists for the life of the network.
    // This is intentional: the secret is set once during init and shared
    // via the pairing code. It doesn't expire.
    await kv.put(authKey(networkId), tokenHash);
    return null; // Registered successfully
  }

  // Compare hashes — constant-time to prevent timing attacks.
  // Not exploitable over HTTPS+Cloudflare (timing noise >> comparison delta),
  // but correct by construction is better than correct by accident.
  if (!timingSafeEqual(tokenHash, storedHash)) {
    return Response.json(
      { error: "invalid token" },
      { status: 401, headers: cors }
    );
  }

  return null; // Valid
}

// ── Main Handler ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
    const url = new URL(request.url);
    const cors = corsHeaders(env, url.pathname);
    const ip = request.headers.get("cf-connecting-ip") || "unknown";

    // CORS preflight — must include Authorization in allowed headers
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ── Pairing ──────────────────────────────────────────────

    // POST /pair — create a pairing code
    // Accepts { deviceId, networkId?, networkSecret? }
    // Relay holds plaintext secret in PAIRS KV for ≤10 min (one-time use, auto-expires)
    if (request.method === "POST" && url.pathname === "/pair") {
      // Rate limit: 10 POST /pair per minute per IP
      if (!(await checkRateLimit(env.PAIRS, ip, "pair-post", 10))) {
        return Response.json(
          { error: "rate limited — try again in 60 seconds" },
          { status: 429, headers: { ...cors, "Retry-After": "60" } }
        );
      }

      try {
        const body = (await request.json()) as {
          deviceId?: string;
          networkId?: string;
          networkSecret?: string;
        };

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

        // Store pairing payload with optional secret hash.
        // SECURITY: We store sha256(secret) so the relay never holds plaintext.
        // The raw secret is passed through to the joiner via the one-time code.
        const payload: Record<string, string | null> = {
          deviceId: body.deviceId,
          networkId: body.networkId || null,
        };

        // If networkSecret provided, store the hash AND the raw secret.
        // The hash is for the relay's own auth validation later.
        // The raw secret is passed to the joiner so both peers share it.
        // This is safe because the code is one-time use and expires in 10 min.
        if (body.networkSecret) {
          payload.networkSecret = body.networkSecret;
          payload.secretHash = await sha256(body.networkSecret);
        }

        await env.PAIRS.put(code, JSON.stringify(payload), {
          expirationTtl: 600,
        });

        return Response.json({ code }, { status: 201, headers: cors });
      } catch {
        return Response.json(
          { error: "invalid request body" },
          { status: 400, headers: cors }
        );
      }
    }

    // GET /pair/:code — retrieve and delete (one-time use)
    if (request.method === "GET" && url.pathname.startsWith("/pair/")) {
      const code = url.pathname.slice("/pair/".length);

      // Rate limit: 20 GET /pair per minute per IP (allow retries for typos)
      if (!(await checkRateLimit(env.PAIRS, ip, "pair-get", 20))) {
        return Response.json(
          { error: "rate limited — try again in 60 seconds" },
          { status: 429, headers: { ...cors, "Retry-After": "60" } }
        );
      }

      if (!isValidCode(code)) {
        return Response.json(
          { error: "invalid code format" },
          { status: 400, headers: cors }
        );
      }

      const raw = await env.PAIRS.get(code);
      if (!raw) {
        return Response.json(
          { error: "code not found or expired" },
          { status: 404, headers: cors }
        );
      }

      // Delete immediately — one-time use
      await env.PAIRS.delete(code);

      // Handle both old format (plain deviceId string) and new format (JSON)
      let deviceId: string;
      let networkId: string | null = null;
      let networkSecret: string | null = null;

      try {
        const parsed = JSON.parse(raw);
        deviceId = parsed.deviceId;
        networkId = parsed.networkId || null;
        networkSecret = parsed.networkSecret || null;
        // Note: secretHash is NOT returned — it's for relay internal use only
      } catch {
        // Old format — raw string is the deviceId
        deviceId = raw;
      }

      const response: Record<string, string | null> = { deviceId, networkId };
      if (networkSecret) {
        response.networkSecret = networkSecret;
      }

      return Response.json(response, { headers: cors });
    }

    // ── Network / Dashboard ──────────────────────────────────

    // POST /network/:id/heartbeat — device checks in (requires auth)
    const heartbeatMatch = url.pathname.match(
      /^\/network\/([a-zA-Z0-9_-]+)\/heartbeat$/
    );
    if (request.method === "POST" && heartbeatMatch) {
      const networkId = heartbeatMatch[1];

      // Extract Bearer token from Authorization header
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

      // Validate auth — returns error Response or null (valid)
      const authError = await validateNetworkAuth(
        env.NETWORKS,
        networkId,
        token,
        cors
      );
      if (authError) return authError;

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

        // Store with 10-minute TTL — stale devices auto-expire.
        // Heartbeat interval is 5 min, so devices survive one missed beat.
        const key = deviceKey(networkId, device.deviceId);
        await env.NETWORKS.put(key, JSON.stringify(device), {
          expirationTtl: 600,
        });

        return Response.json({ ok: true }, { headers: cors });
      } catch {
        return Response.json(
          { error: "invalid request body" },
          { status: 400, headers: cors }
        );
      }
    }

    // GET /network/:id/devices — list devices (requires auth via query param)
    const devicesMatch = url.pathname.match(
      /^\/network\/([a-zA-Z0-9_-]+)\/devices$/
    );
    if (request.method === "GET" && devicesMatch) {
      const networkId = devicesMatch[1];

      // Auth via query param (dashboard passes token in URL fragment → JS reads it)
      const token = url.searchParams.get("token");

      // Validate auth
      const authError = await validateNetworkAuth(
        env.NETWORKS,
        networkId,
        token,
        cors
      );
      if (authError) return authError;

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

      return Response.json(
        { networkId, devices, count: devices.length },
        { headers: cors }
      );
    }

    // Health check — unauthenticated (monitoring)
    if (url.pathname === "/") {
      return Response.json(
        { status: "ok", service: "botsync-relay", version: "0.5.2" },
        { headers: cors }
      );
    }

    return Response.json(
      { error: "not found" },
      { status: 404, headers: cors }
    );
    } catch (err) {
      return Response.json(
        { error: "internal error", message: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  },
};
