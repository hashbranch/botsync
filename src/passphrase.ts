/**
 * passphrase.ts — Human-readable pairing codes via relay.
 *
 * Instead of encoding the full device ID into a massive base58 string,
 * we now use a 4-word code like "castle-river-falcon-dawn". The device
 * ID is stored temporarily on a Cloudflare Worker relay, and the code
 * is the lookup key.
 *
 * Falls back to the old base58 encoding if the relay is unreachable
 * (offline/airgap mode).
 */

import baseX from "base-x";

const RELAY_URL = "https://relay.botsync.io";

// Keep base58 as fallback for offline use
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const bs58 = baseX(BASE58);

export interface PassphraseData {
  deviceId: string;
  folders: string[];
  networkId?: string;
  networkSecret?: string;
}

/**
 * Register a device ID with the relay and get a short code.
 * Falls back to base58 encoding if the relay is unreachable.
 */
export async function createCode(data: PassphraseData): Promise<{ code: string; isRelay: boolean }> {
  try {
    const res = await fetch(`${RELAY_URL}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: data.deviceId,
        networkId: data.networkId,
        networkSecret: data.networkSecret,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const { code } = (await res.json()) as { code: string };
      return { code, isRelay: true };
    }
  } catch {
    // Relay unreachable — fall back to offline mode
  }

  // Offline fallback: base58 encode everything
  const json = JSON.stringify(data);
  const buf = Buffer.from(json, "utf-8");
  return { code: bs58.encode(buf), isRelay: false };
}

/**
 * Resolve a pairing code to connection data.
 * If it looks like a word code (contains dashes, all alpha), try the relay.
 * Otherwise treat it as a base58 offline passphrase.
 */
export async function resolveCode(code: string): Promise<PassphraseData> {
  // Word codes contain dashes and only letters
  const isWordCode = code.includes("-") && /^[a-z-]+$/.test(code);

  if (isWordCode) {
    const res = await fetch(`${RELAY_URL}/pair/${code}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("Pairing code not found. It may have expired (codes last 10 minutes) or already been used. Ask your peer for a new code.");
      }
      if (res.status === 429) {
        throw new Error("Too many attempts. Wait a minute and try again.");
      }
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Relay error (${res.status}). Try again or check your internet connection.`);
    }

    const { deviceId, networkId, networkSecret } = (await res.json()) as {
      deviceId: string;
      networkId?: string;
      networkSecret?: string;
    };
    // Folders are always the standard set — no need to encode them
    return {
      deviceId,
      folders: ["botsync-shared", "botsync-deliverables", "botsync-inbox"],
      networkId: networkId || undefined,
      networkSecret: networkSecret || undefined,
    };
  }

  // Legacy base58 fallback
  const buf = Buffer.from(bs58.decode(code));
  const json = buf.toString("utf-8");
  return JSON.parse(json) as PassphraseData;
}

// Keep old exports for backward compat during transition
export function encode(data: PassphraseData): string {
  const json = JSON.stringify(data);
  const buf = Buffer.from(json, "utf-8");
  return bs58.encode(buf);
}

export function decode(passphrase: string): PassphraseData {
  const buf = Buffer.from(bs58.decode(passphrase));
  const json = buf.toString("utf-8");
  return JSON.parse(json) as PassphraseData;
}
