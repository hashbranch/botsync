/**
 * status.ts — The `botsync status` command.
 *
 * Shows what's going on: how many peers are connected, and whether
 * each folder is in sync. Queries the Syncthing REST API for live data.
 *
 * This is the "is it working?" command — run it after init or join
 * to verify everything connected properly.
 */

import { readConfig, FOLDERS } from "../config.js";
import { apiCall } from "../syncthing.js";

interface ConnectionsResponse {
  connections: Record<string, { connected: boolean; paused: boolean }>;
}

interface FolderStatus {
  globalFiles: number;
  localFiles: number;
  inSyncFiles: number;
  state: string;
  stateChanged: string;
}

export async function status(): Promise<void> {
  const config = readConfig();
  if (!config) {
    console.log("botsync is not initialized. Run `botsync init` first.");
    return;
  }

  try {
    // Check connected peers
    const conns = await apiCall<ConnectionsResponse>("GET", "/rest/system/connections");
    const connectedPeers = Object.values(conns.connections).filter((c) => c.connected).length;

    console.log(`\n📡 Connected peers: ${connectedPeers}`);
    console.log(`🔑 Device ID: ${config.deviceId?.substring(0, 7) ?? "unknown"}...`);
    console.log("");

    // Check each folder's sync status
    for (const folder of FOLDERS) {
      try {
        const st = await apiCall<FolderStatus>("GET", `/rest/db/status?folder=${folder.id}`);

        // Calculate sync percentage — if there are no global files, we're "in sync"
        const pct =
          st.globalFiles === 0
            ? 100
            : Math.round((st.inSyncFiles / st.globalFiles) * 100);

        const stateEmoji = st.state === "idle" ? "✅" : "🔄";
        const lastSync = st.stateChanged
          ? new Date(st.stateChanged).toLocaleString()
          : "never";

        console.log(`${stateEmoji} ${folder.id}: ${pct}% synced (${st.state}) — last change: ${lastSync}`);
      } catch {
        console.log(`❓ ${folder.id}: unable to query status`);
      }
    }

    console.log("");
  } catch {
    console.log("botsync daemon is not running. Start it with `botsync init`.");
  }
}
