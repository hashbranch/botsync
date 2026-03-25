/**
 * heartbeat.ts — Periodic heartbeat to the botsync relay.
 *
 * Sends device info every 60s so the dashboard at botsync.io/dashboard
 * can show connected devices. The relay stores each heartbeat in KV
 * with a 5-minute TTL — if we stop heartbeating, we disappear.
 *
 * The heartbeat runs in the background and never throws — a failed
 * heartbeat just means we're invisible on the dashboard for a cycle.
 */

import { hostname } from "os";
import { readConfig, readNetworkId } from "./config.js";

const RELAY_URL = "https://relay.botsync.io";
const HEARTBEAT_INTERVAL_MS = 60_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Send a single heartbeat to the relay. */
async function sendHeartbeat(): Promise<void> {
  const config = readConfig();
  const networkId = readNetworkId();

  if (!config?.deviceId || !networkId) return;

  try {
    await fetch(`${RELAY_URL}/network/${encodeURIComponent(networkId)}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: config.deviceId,
        name: hostname(),
        os: process.platform,
        version: getVersion(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silent fail — dashboard visibility is best-effort
  }
}

/** Start the heartbeat loop. Sends one immediately, then every 60s. */
export function startHeartbeat(): void {
  if (heartbeatTimer) return; // Already running

  // Fire immediately so the device shows up right away
  sendHeartbeat();

  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Don't let the heartbeat timer keep the process alive if
  // everything else is done (shouldn't happen since Syncthing
  // daemon is the main keep-alive, but just in case)
  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

/** Stop the heartbeat loop. */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** Read package version, fallback to 0.0.0 */
function getVersion(): string {
  try {
    const pkg = require("../package.json");
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
