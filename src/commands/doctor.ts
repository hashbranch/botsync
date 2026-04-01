/**
 * doctor.ts — The `botsync doctor` command.
 *
 * Collects a local diagnostics snapshot for common botsync failure modes.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import {
  CONFIG_FILE,
  DEFAULT_WEBHOOK_URL,
  EVENTS_PID_FILE,
  LOGS_DIR,
  NETWORK_FILE,
  PID_FILE,
  readConfig,
  readNetworkId,
  readNetworkSecret,
} from "../config.js";
import { isEventsRunning } from "../events.js";
import { isHeartbeatRunning } from "../heartbeat.js";
import { readRecentTrace } from "../log.js";
import { apiCall, getSyncthingBin } from "../syncthing.js";
import { VERSION } from "../version.js";
import * as ui from "../ui.js";

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface FolderReport {
  name: string;
  state: string;
  synced: boolean;
}

interface DoctorReport {
  version: string;
  platform: string;
  node: string;
  configPath: string;
  networkPath: string;
  logsPath: string;
  checks: DoctorCheck[];
  folders: FolderReport[];
  recentIssues: Array<{
    ts: string;
    level: string;
    component: string;
    message: string;
    code?: string;
  }>;
}

interface FolderStatus {
  state: string;
  needFiles: number;
}

function check(name: string, ok: boolean, detail: string): DoctorCheck {
  return { name, ok, detail };
}

async function collectDoctorReport(): Promise<DoctorReport> {
  const report: DoctorReport = {
    version: VERSION,
    platform: `${process.platform}/${process.arch}`,
    node: process.version,
    configPath: CONFIG_FILE,
    networkPath: NETWORK_FILE,
    logsPath: LOGS_DIR,
    checks: [],
    folders: [],
    recentIssues: readRecentTrace(20).map((entry) => ({
      ts: entry.ts,
      level: entry.level,
      component: entry.component,
      message: entry.message,
      ...(entry.code ? { code: entry.code } : {}),
    })),
  };

  const config = readConfig();
  report.checks.push(
    check("config", !!config, config ? "config.json loaded" : "config.json missing or invalid")
  );

  const networkId = readNetworkId();
  const networkSecret = readNetworkSecret();
  report.checks.push(
    check(
      "network",
      existsSync(NETWORK_FILE),
      networkId
        ? `network registered (${networkId.substring(0, 8)}...)`
        : existsSync(NETWORK_FILE)
          ? "network file present"
          : "network.json missing"
    )
  );
  report.checks.push(
    check(
      "network-secret",
      !!networkSecret,
      networkSecret ? "network secret present" : "network secret missing"
    )
  );

  const syncthingBin = getSyncthingBin();
  report.checks.push(
    check(
      "syncthing-binary",
      existsSync(syncthingBin),
      existsSync(syncthingBin) ? syncthingBin : `not found (${syncthingBin})`
    )
  );

  let syncthingOk = false;
  if (config) {
    try {
      await apiCall("GET", "/rest/system/ping");
      syncthingOk = true;
      report.checks.push(
        check("syncthing-api", true, `reachable on 127.0.0.1:${config.apiPort}`)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.checks.push(check("syncthing-api", false, msg));
    }
  } else {
    report.checks.push(check("syncthing-api", false, "config missing"));
  }

  report.checks.push(
    check(
      "heartbeat",
      isHeartbeatRunning(),
      isHeartbeatRunning()
        ? "heartbeat daemon running"
        : existsSync(join(LOGS_DIR, "heartbeat.log"))
          ? "heartbeat daemon not running"
          : "heartbeat daemon has not started"
    )
  );

  const webhookConfigured = !!(process.env.OPENCLAW_HOOKS_TOKEN || config?.webhookToken);
  const webhookUrl = process.env.OPENCLAW_HOOKS_URL || config?.webhookUrl || DEFAULT_WEBHOOK_URL;
  report.checks.push(
    check(
      "events",
      webhookConfigured ? isEventsRunning() : true,
      webhookConfigured
        ? isEventsRunning()
          ? `events daemon running (${webhookUrl})`
          : `webhook configured but events daemon stopped (${webhookUrl})`
        : "webhook not configured"
    )
  );

  report.checks.push(
    check(
      "pid-files",
      existsSync(PID_FILE) || existsSync(EVENTS_PID_FILE),
      existsSync(PID_FILE) || existsSync(EVENTS_PID_FILE)
        ? "daemon pid files present"
        : "no daemon pid files present"
    )
  );

  if (syncthingOk) {
    try {
      const stConfig = await apiCall<{ folders: Array<{ id: string }> }>("GET", "/rest/config");
      for (const folder of stConfig.folders.filter((f) => f.id.startsWith("botsync-"))) {
        try {
          const status = await apiCall<FolderStatus>("GET", `/rest/db/status?folder=${folder.id}`);
          report.folders.push({
            name: folder.id.replace("botsync-", ""),
            state: status.state,
            synced: status.state === "idle" && status.needFiles === 0,
          });
        } catch {
          report.folders.push({
            name: folder.id.replace("botsync-", ""),
            state: "unknown",
            synced: false,
          });
        }
      }
    } catch {
      // Folder diagnostics are best-effort.
    }
  }

  return report;
}

export async function doctor(options: { json?: boolean } = {}): Promise<void> {
  const report = await collectDoctorReport();
  const hasFailures = report.checks.some((item) => !item.ok);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(hasFailures ? 1 : 0);
  }

  ui.header();
  ui.info(`Version: ${report.version}`);
  ui.info(`Platform: ${report.platform}`);
  ui.info(`Node: ${report.node}`);
  ui.info(`Logs: ${report.logsPath.replace(homedir(), "~")}`);
  ui.gap();

  for (const item of report.checks) {
    if (item.ok) {
      ui.stepDone(`${item.name}: ${item.detail}`);
    } else {
      ui.stepFail(`${item.name}: ${item.detail}`);
    }
  }

  if (report.folders.length > 0) {
    ui.gap();
    ui.info("Folders:");
    for (const folder of report.folders) {
      ui.info(`  ${folder.name}: ${folder.synced ? "idle" : folder.state}`);
    }
  }

  if (report.recentIssues.length > 0) {
    ui.gap();
    ui.info("Recent issues:");
    for (const issue of report.recentIssues.slice(0, 10)) {
      const code = issue.code ? ` ${issue.code}` : "";
      ui.info(`  ${issue.ts} [${issue.component}]${code} ${issue.message}`);
    }
  }

  ui.gap();
  process.exit(hasFailures ? 1 : 0);
}
