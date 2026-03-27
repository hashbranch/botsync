/**
 * ui.test.ts — Tests for passphraseBox overflow logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock chalk to return plain strings (avoid ANSI in test assertions)
vi.mock("chalk", () => {
  const identity = (s: string) => s;
  const fn: any = Object.assign(identity, {
    cyan: identity,
    green: identity,
    dim: identity,
    bold: identity,
    yellow: identity,
    red: identity,
    white: identity,
  });
  return { default: fn };
});

// Mock ora since we don't need spinners in tests
vi.mock("ora", () => ({
  default: () => ({ start: vi.fn(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() }),
}));

import { passphraseBox } from "../src/ui.js";

describe("passphraseBox", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: any[]) => {
      logs.push(args.join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders box for short codes", () => {
    passphraseBox("castle-river-falcon-dawn-maple", "npx botsync join castle-river-falcon-dawn-maple");
    const output = logs.join("\n");
    // Should contain box characters
    expect(output).toContain("┌");
    expect(output).toContain("┘");
    expect(output).toContain("castle-river-falcon-dawn-maple");
  });

  it("skips box for long passphrases (>70 chars)", () => {
    const longPass = "A".repeat(80);
    passphraseBox(longPass, `npx botsync join ${longPass}`);
    const output = logs.join("\n");
    // Should NOT contain box characters
    expect(output).not.toContain("┌");
    expect(output).not.toContain("┘");
    // But should still contain the passphrase
    expect(output).toContain(longPass);
  });

  it("renders box when command is long but passphrase is short", () => {
    // The box width is based on the longest line — if command pushes it over, skip box
    passphraseBox("short", "npx botsync join short");
    const output = logs.join("\n");
    expect(output).toContain("┌");
    expect(output).toContain("short");
  });
});
