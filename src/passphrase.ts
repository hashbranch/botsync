/**
 * passphrase.ts — Encode/decode connection info as a base58 passphrase.
 *
 * The passphrase is the entire UX of botsync's pairing flow. It encodes
 * the remote device ID and folder list into a single copy-pasteable string.
 * We use base58 (Bitcoin alphabet) because it's URL-safe, no ambiguous chars
 * (no 0/O/I/l), and looks like "a thing" rather than random garbage.
 *
 * Format: JSON.stringify({deviceId, folders}) → Buffer → base58 encode.
 * Dead simple. No encryption needed — device IDs aren't secret in Syncthing's
 * threat model (they're essentially public keys).
 */

import baseX from "base-x";

// Bitcoin's base58 alphabet — no 0, O, I, l to avoid visual ambiguity
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const bs58 = baseX(BASE58);

export interface PassphraseData {
  deviceId: string;
  folders: string[];
}

/** Encode connection data into a base58 passphrase string */
export function encode(data: PassphraseData): string {
  const json = JSON.stringify(data);
  const buf = Buffer.from(json, "utf-8");
  return bs58.encode(buf);
}

/** Decode a base58 passphrase back into connection data */
export function decode(passphrase: string): PassphraseData {
  const buf = Buffer.from(bs58.decode(passphrase));
  const json = buf.toString("utf-8");
  return JSON.parse(json) as PassphraseData;
}
