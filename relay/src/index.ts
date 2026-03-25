/**
 * botsync-relay — Cloudflare Worker for ephemeral pairing.
 *
 * Two endpoints:
 *   POST /pair     — store a device ID, get back a 4-word code
 *   GET  /pair/:code — retrieve the device ID, delete it (one-time use)
 *
 * Device IDs are stored in Cloudflare KV with a 10-minute TTL.
 * After retrieval (or expiry), the data is gone. No persistence,
 * no accounts, no tracking. The relay never sees sync data —
 * only the Syncthing device ID (which is a public key hash).
 */

export interface Env {
  PAIRS: KVNamespace;
  CORS_ORIGIN: string;
}

import { generateCode, isValidCode } from "./words.js";

/** CORS headers for cross-origin CLI requests. */
function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

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

        // Validate device ID format (Syncthing uses 52-char base32 with dashes)
        const cleaned = body.deviceId.replace(/-/g, "");
        if (cleaned.length < 40) {
          return Response.json(
            { error: "invalid deviceId format" },
            { status: 400, headers: cors }
          );
        }

        // Generate a unique code — retry on collision (astronomically unlikely)
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

        // Store with 10-minute TTL
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

      // One-time use — delete after retrieval
      await env.PAIRS.delete(code);

      return Response.json({ deviceId }, { headers: cors });
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
