/**
 * passphrase.test.ts — Tests for encode/decode, relay interaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encode, decode, createCode, resolveCode, type PassphraseData } from "../src/passphrase.js";

const SAMPLE_DATA: PassphraseData = {
  deviceId: "ABCDEFG-1234567-HIJKLMN-OPQRSTU-VWXYZ01-2345678-9ABCDEF-GHIJKLM",
  folders: ["botsync-shared", "botsync-deliverables", "botsync-inbox"],
  networkId: "net-123",
  networkSecret: "secret-456",
};

describe("base58 encode/decode (offline mode)", () => {
  it("round-trips passphrase data", () => {
    const encoded = encode(SAMPLE_DATA);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(10);

    const decoded = decode(encoded);
    expect(decoded).toEqual(SAMPLE_DATA);
  });

  it("produces different output for different input", () => {
    const a = encode({ ...SAMPLE_DATA, deviceId: "AAA" });
    const b = encode({ ...SAMPLE_DATA, deviceId: "BBB" });
    expect(a).not.toBe(b);
  });
});

describe("createCode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns relay code when relay responds OK", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "castle-river-falcon-dawn-maple" }),
    });

    const result = await createCode(SAMPLE_DATA);
    expect(result.isRelay).toBe(true);
    expect(result.code).toBe("castle-river-falcon-dawn-maple");
  });

  it("falls back to base58 when relay fails", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network error"));

    const result = await createCode(SAMPLE_DATA);
    expect(result.isRelay).toBe(false);
    // Should be a valid base58 string
    expect(result.code.length).toBeGreaterThan(10);
    // Should be decodable
    const decoded = decode(result.code);
    expect(decoded.deviceId).toBe(SAMPLE_DATA.deviceId);
  });

  it("falls back to base58 when relay returns non-OK", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await createCode(SAMPLE_DATA);
    expect(result.isRelay).toBe(false);
  });
});

describe("resolveCode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves word codes via relay", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        deviceId: "REMOTE-DEVICE-ID",
        networkId: "net-remote",
        networkSecret: "sec-remote",
      }),
    });

    const data = await resolveCode("castle-river-falcon-dawn-maple");
    expect(data.deviceId).toBe("REMOTE-DEVICE-ID");
    expect(data.networkId).toBe("net-remote");
    expect(data.networkSecret).toBe("sec-remote");
    expect(data.folders).toEqual(["botsync-shared", "botsync-deliverables", "botsync-inbox"]);
  });

  it("decodes base58 strings without hitting relay", async () => {
    const encoded = encode(SAMPLE_DATA);
    // No fetch mock needed — base58 doesn't use relay
    const data = await resolveCode(encoded);
    expect(data.deviceId).toBe(SAMPLE_DATA.deviceId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when relay returns error for word code", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "code expired" }),
    });

    await expect(resolveCode("castle-river-falcon-dawn-maple")).rejects.toThrow("code expired");
  });
});
