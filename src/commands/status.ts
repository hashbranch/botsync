/**
 * status.ts — The `botsync status` command.
 *
 * Shows connected peers, device ID, and per-folder sync state.
 */

import { readConfig, FOLDERS, DEFAULT_WEBHOOK_URL } from "../config.js";
import { apiCall } from "../syncthing.js";
import { isEventsRunning } from "../events.js";
import * as ui from "../ui.js";

interface Connection {
  connected: boolean;
  paused: boolean;
  address: string;
}

interface FolderStatus {
  state: string;
  stateChanged: string;
  needFiles: number;
  globalFiles: number;
}

export async function status(): Promise<void> {
  const config = readConfig();
  if (!config) {
    ui.notRunning();
    return;
  }

  // Check if daemon is actually running
  try {
    await apiCall("GET", "/rest/system/status");
  } catch {
    ui.notRunning();
    return;
  }

  // Get connections
  const connections = await apiCall<{
    connections: Record<string, Connection>;
  }>("GET", "/rest/system/connections");

  const peers = Object.values(connections.connections).filter((c) => c.connected).length;

  // Get folder statuses
  const folders: Array<{ name: string; synced: boolean; state: string; lastChange?: string }> = [];

  for (const f of FOLDERS) {
    try {
      const s = await apiCall<FolderStatus>("GET", `/rest/db/status?folder=${f.id}`);
      const synced = s.state === "idle" && s.needFiles === 0;
      const state = synced ? "idle" : s.state;
      folders.push({
        name: f.id.replace("botsync-", ""),
        synced,
        state,
        lastChange: s.stateChanged,
      });
    } catch {
      folders.push({ name: f.id.replace("botsync-", ""), synced: false, state: "unknown" });
    }
  }

  // Determine events daemon status
  const webhookToken = process.env.OPENCLAW_HOOKS_TOKEN || config.webhookToken;
  let eventsStatus: string;
  if (!webhookToken) {
    eventsStatus = "not configured";
  } else if (isEventsRunning()) {
    const webhookUrl =
      process.env.OPENCLAW_HOOKS_URL || config.webhookUrl || DEFAULT_WEBHOOK_URL;
    eventsStatus = `running (webhook: ${webhookUrl})`;
  } else {
    eventsStatus = "stopped";
  }

  ui.statusTable(peers, config.deviceId || "unknown", folders, eventsStatus);
}
