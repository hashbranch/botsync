/**
 * log.ts — Small local diagnostics logger for botsync.
 *
 * Writes both per-component text logs and a structured JSONL trace file
 * under ~/.botsync/logs (inside the sync root's .botsync directory).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { LOGS_DIR } from "./config.js";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  message: string;
  code?: string;
  data?: Record<string, unknown>;
}

const TRACE_LOG_FILE = join(LOGS_DIR, "trace.jsonl");
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_ROTATED_FILES = 4;
const REDACT_KEYS = /apikey|authorization|networksecret|webhooktoken|token|secret/i;

function ensureLogsDir(): void {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function rotateIfNeeded(path: string): void {
  try {
    if (!existsSync(path) || statSync(path).size < MAX_LOG_BYTES) return;

    for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
      const current = `${path}.${i}`;
      const next = `${path}.${i + 1}`;
      if (!existsSync(current)) continue;
      if (i === MAX_ROTATED_FILES) {
        unlinkSync(current);
      } else {
        renameSync(current, next);
      }
    }
    renameSync(path, `${path}.1`);
  } catch {
    // Logging must never break the main command path.
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (REDACT_KEYS.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redact(raw);
    }
  }
  return output;
}

function appendLine(path: string, line: string): void {
  ensureLogsDir();
  rotateIfNeeded(path);
  appendFileSync(path, line + "\n", "utf-8");
}

function formatText(entry: LogEntry): string {
  const parts = [entry.ts, entry.level.toUpperCase(), `[${entry.component}]`];
  if (entry.code) parts.push(entry.code);
  parts.push(entry.message);
  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(JSON.stringify(entry.data));
  }
  return parts.join(" ");
}

export function log(
  component: string,
  level: LogLevel,
  message: string,
  options: { code?: string; data?: Record<string, unknown> } = {}
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(options.code ? { code: options.code } : {}),
    ...(options.data ? { data: redact(options.data) as Record<string, unknown> } : {}),
  };

  try {
    appendLine(join(LOGS_DIR, `${component}.log`), formatText(entry));
    appendLine(TRACE_LOG_FILE, JSON.stringify(entry));
  } catch {
    // Never throw from logging.
  }
}

export function createLogger(component: string) {
  return {
    info(message: string, data?: Record<string, unknown>): void {
      log(component, "info", message, { data });
    },
    warn(message: string, code?: string, data?: Record<string, unknown>): void {
      log(component, "warn", message, { code, data });
    },
    error(message: string, code?: string, data?: Record<string, unknown>): void {
      log(component, "error", message, { code, data });
    },
  };
}

export function readRecentTrace(limit = 20, minLevel: LogLevel = "warn"): LogEntry[] {
  try {
    const levels: LogLevel[] = minLevel === "warn" ? ["warn", "error"] : [minLevel];
    const raw = readFileSync(TRACE_LOG_FILE, "utf-8").trim();
    if (!raw) return [];
    return raw
      .split("\n")
      .map((line) => JSON.parse(line) as LogEntry)
      .filter((entry) => levels.includes(entry.level))
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

export function getTraceLogFile(): string {
  return TRACE_LOG_FILE;
}
