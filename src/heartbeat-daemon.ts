#!/usr/bin/env node
/**
 * heartbeat-daemon.ts — Standalone background heartbeat process.
 *
 * Spawned as a detached child by init/join. Sends heartbeats every 60s
 * until the Syncthing daemon dies (checked via API ping), then exits.
 *
 * Usage: node heartbeat-daemon.js
 * (Not meant to be run directly — spawned by init/join)
 */

import { hostname } from "os";
import { readConfig, readNetworkId, readNetworkSecret, BOTSYNC_DIR } from "./config.js";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { createLogger } from "./log.js";

const RELAY_URL = "https://relay.botsync.io";
const HEARTBEAT_INTERVAL_MS = 300_000; // 5 minutes — balances liveness with KV write quota
const HEALTH_CHECK_INTERVAL_MS = 120_000; // Check if Syncthing is alive every 2 min
const PID_FILE = join(BOTSYNC_DIR, "heartbeat.pid");
const logger = createLogger("heartbeat");

function getVersion(): string {
  try {
    return require("../package.json").version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Get the network secret from env (preferred) or disk (fallback).
 *
 * SECURITY: Env var is set by the parent process (startHeartbeat) to avoid
 * exposing the secret in CLI args. Falls back to reading from disk for
 * cases where the daemon is restarted independently.
 */
function getNetworkSecret(): string | null {
  return process.env.BOTSYNC_NETWORK_SECRET || readNetworkSecret();
}

async function sendHeartbeat(): Promise<boolean> {
  const config = readConfig();
  const networkId = readNetworkId();
  if (!config?.deviceId || !networkId) {
    logger.warn("heartbeat skipped due to missing config", "BSYNC_RELAY_HEARTBEAT_FAILED");
    return false;
  }

  // Build headers — include auth token if available
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const secret = getNetworkSecret();
  if (secret) {
    // SECURITY: Bearer token authenticates this device to the relay.
    // The relay validates sha256(token) against the stored hash.
    headers["Authorization"] = `Bearer ${secret}`;
  }

  try {
    const res = await fetch(
      `${RELAY_URL}/network/${encodeURIComponent(networkId)}/heartbeat`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          deviceId: config.deviceId,
          name: hostname(),
          os: process.platform,
          version: getVersion(),
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) {
      logger.warn("relay heartbeat failed", "BSYNC_RELAY_HEARTBEAT_FAILED", {
        status: res.status,
        networkId,
      });
    }
    return res.ok;
  } catch {
    logger.warn("relay heartbeat failed", "BSYNC_RELAY_HEARTBEAT_FAILED", {
      networkId,
    });
    return false;
  }
}

async function isSyncthingAlive(): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;

  try {
    const res = await fetch(
      `http://127.0.0.1:${config.apiPort}/rest/system/ping`,
      {
        headers: { "X-API-Key": config.apiKey },
        signal: AbortSignal.timeout(3000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  // Write our PID so stop can kill us
  writeFileSync(PID_FILE, String(process.pid));
  logger.info("heartbeat daemon started", { pid: process.pid });

  // Cleanup PID file on exit
  const cleanup = () => {
    try {
      unlinkSync(PID_FILE);
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => {
    logger.info("heartbeat daemon stopped", { pid: process.pid, signal: "SIGTERM" });
    cleanup();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    logger.info("heartbeat daemon stopped", { pid: process.pid, signal: "SIGINT" });
    cleanup();
    process.exit(0);
  });

  // Initial heartbeat
  await sendHeartbeat();

  // Heartbeat loop
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Health check loop — exit if Syncthing is gone
  setInterval(async () => {
    const alive = await isSyncthingAlive();
    if (!alive) {
      logger.warn("heartbeat daemon exiting because syncthing is unavailable", "BSYNC_SYNCTHING_API_UNREACHABLE");
      cleanup();
      process.exit(0);
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("heartbeat daemon crashed", "BSYNC_HEARTBEAT_DAEMON_CRASHED", { error: message });
  process.exit(1);
});
