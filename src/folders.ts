/**
 * folders.ts — Custom folder management for botsync.
 *
 * Thin wrapper around Syncthing's REST API that lets users add, list,
 * remove, and share additional folders beyond the default `botsync-shared`.
 *
 * All folder IDs follow the `botsync-<name>` convention so they are cleanly
 * separated from any non-botsync folders a user might have set up via the
 * Syncthing web UI. Everything else is pure Syncthing: stock Syncthing peers
 * can accept botsync-managed folder shares with no special client support.
 */

import { mkdirSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

import { SYNC_DIR } from "./config.js";
import { apiCall, getDeviceId } from "./syncthing.js";
import { createLogger } from "./log.js";

const logger = createLogger("folders");

/** Every folder id we manage is prefixed with this. */
export const BOTSYNC_PREFIX = "botsync-";

/** The only folder we ship out of the box. Protected from `folder remove`. */
export const DEFAULT_FOLDER_NAME = "shared";

/**
 * Names we refuse to (re)create via `folder add`.
 * - `shared` is the current default and is created by `botsync init`.
 * - `inbox` / `deliverables` are deprecated defaults from pre-v0.5.0 that
 *   the start-up code actively cleans up; re-creating them would reintroduce
 *   confusion.
 * - `botsync` / `.botsync` would collide with our internal state directory.
 */
const RESERVED_NAMES = new Set([
  "shared",
  "inbox",
  "deliverables",
  "botsync",
  ".botsync",
]);

/** Syncthing folder type values we support. `sendreceive` is the common case. */
export type FolderType = "sendreceive" | "sendonly" | "receiveonly";
export const VALID_FOLDER_TYPES: FolderType[] = ["sendreceive", "sendonly", "receiveonly"];

/**
 * The minimal shape of a Syncthing config response we care about. We keep
 * the `unknown` passthrough so we can PUT the full config back without
 * losing fields we don't understand.
 */
interface SyncthingFolder {
  id: string;
  label?: string;
  path: string;
  type: FolderType | string;
  devices?: Array<{ deviceID: string } & Record<string, unknown>>;
  [key: string]: unknown;
}

interface SyncthingDevice {
  deviceID: string;
  [key: string]: unknown;
}

interface SyncthingConfig {
  devices: SyncthingDevice[];
  folders: SyncthingFolder[];
  [key: string]: unknown;
}

interface FolderStatus {
  state: string;
  needFiles: number;
  globalFiles: number;
}

/** Public shape returned by `listFolders` — what the CLI renders. */
export interface ManagedFolder {
  id: string;
  name: string;
  path: string;
  type: string;
  deviceCount: number;
  devices: string[];
  isDefault: boolean;
  state: string;
  synced: boolean;
}

// ------------------------------------------------------------------------
// Name / id helpers — pure, no IO. Kept separate for easy unit testing.
// ------------------------------------------------------------------------

/**
 * Ensure a user-supplied folder name is safe to use as both a filesystem
 * directory name and a Syncthing folder id. Throws a human-readable error
 * on any violation.
 */
export function validateFolderName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Folder name is required.");
  }

  const trimmed = name.trim();

  if (trimmed.length > 64) {
    throw new Error("Folder name must be 64 characters or fewer.");
  }

  // Slashes / path separators are a hard no: they'd break the on-disk path
  // assumption and could escape the sync root entirely.
  if (/[\\/]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error("Folder name cannot contain slashes or '..' path segments.");
  }

  // Dot-prefixed names collide with dotfiles (and specifically our own .botsync
  // internal state directory).
  if (trimmed.startsWith(".")) {
    throw new Error("Folder name cannot start with '.'");
  }

  // Keep it lowercase / filesystem-safe so folder IDs don't shift based on
  // case-sensitivity differences across platforms.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(
      "Folder name must be lowercase letters, numbers, or hyphens (starting with a letter or number).",
    );
  }

  if (RESERVED_NAMES.has(trimmed)) {
    throw new Error(
      `'${trimmed}' is a reserved folder name. Pick something else (try 'tera' or 'gpu-fund').`,
    );
  }
}

/** Map `tera` → `botsync-tera`. */
export function folderIdFor(name: string): string {
  return `${BOTSYNC_PREFIX}${name}`;
}

/**
 * Strip the `botsync-` prefix from a folder id. Returns the raw id if it
 * was not prefixed (which should only happen for non-botsync folders that
 * we generally ignore).
 */
export function nameForFolderId(id: string): string {
  return id.startsWith(BOTSYNC_PREFIX) ? id.slice(BOTSYNC_PREFIX.length) : id;
}

/** Is this the only default folder we ship? */
export function isDefaultFolder(id: string): boolean {
  return id === folderIdFor(DEFAULT_FOLDER_NAME);
}

/**
 * Turn the user-facing `--path` flag into an absolute path.
 * - No override → `<SYNC_DIR>/<name>`.
 * - `~/foo` → `<homedir>/foo` (tilde is not expanded by node automatically).
 * - Anything else is resolved against the CWD so relative paths still work.
 */
export function resolveFolderPath(name: string, override?: string): string {
  if (!override) return join(SYNC_DIR, name);
  if (override === "~") return homedir();
  if (override.startsWith("~/")) return join(homedir(), override.slice(2));
  if (isAbsolute(override)) return override;
  return resolve(override);
}

// ------------------------------------------------------------------------
// Syncthing config helpers.
// ------------------------------------------------------------------------

/**
 * Get the current Syncthing config. We fetch fresh on every mutation so we
 * don't stomp on concurrent changes from the web UI or another tool.
 */
async function getConfig(): Promise<SyncthingConfig> {
  return apiCall<SyncthingConfig>("GET", "/rest/config");
}

/**
 * Read our own device ID. Prefers the cached value in config.json to avoid
 * an API round-trip; falls back to /rest/system/status if unset.
 */
async function getOwnDeviceId(): Promise<string> {
  const { readConfig } = await import("./config.js");
  const cfg = readConfig();
  if (cfg?.deviceId) return cfg.deviceId;
  return getDeviceId();
}

/** Return every device known to Syncthing except our own. */
export async function getPairedDevices(): Promise<string[]> {
  const config = await getConfig();
  const myId = await getOwnDeviceId();
  return config.devices.map((d) => d.deviceID).filter((id) => id !== myId);
}

// ------------------------------------------------------------------------
// Mutations.
// ------------------------------------------------------------------------

export interface AddFolderOptions {
  name: string;
  path: string;
  type: FolderType;
  /** Explicit peer list. Omit to share with every paired device. */
  devices?: string[];
  /** When true, throw if any entry in `devices` is not already paired. */
  strictDevices?: boolean;
}

/**
 * Create a new botsync folder and share it with the given peers.
 *
 * - Validates the name and refuses reserved / duplicate ids before hitting
 *   the API.
 * - Creates the on-disk path (`mkdir -p`) so Syncthing doesn't complain.
 * - Always includes our own device in the share list (Syncthing's UI does
 *   the same; omitting it means Syncthing treats the folder as non-local).
 */
export async function addFolder(opts: AddFolderOptions): Promise<ManagedFolder> {
  validateFolderName(opts.name);

  if (!VALID_FOLDER_TYPES.includes(opts.type)) {
    throw new Error(
      `Invalid folder type '${opts.type}'. Use one of: ${VALID_FOLDER_TYPES.join(", ")}.`,
    );
  }

  const id = folderIdFor(opts.name);

  const [config, myId] = await Promise.all([getConfig(), getOwnDeviceId()]);

  if (config.folders.some((f) => f.id === id)) {
    throw new Error(`Folder '${opts.name}' already exists (id: ${id}).`);
  }

  // Figure out which devices to share with.
  const knownIds = new Set(config.devices.map((d) => d.deviceID));
  let targets: string[];
  if (opts.devices && opts.devices.length > 0) {
    if (opts.strictDevices) {
      const unknown = opts.devices.filter((d) => !knownIds.has(d));
      if (unknown.length > 0) {
        throw new Error(
          `Unknown / not paired devices: ${unknown.join(", ")}. Run 'botsync invite' first.`,
        );
      }
    }
    targets = opts.devices.filter((d) => knownIds.has(d));
  } else {
    // Default: share with everyone paired (minus ourselves).
    targets = config.devices.map((d) => d.deviceID).filter((d) => d !== myId);
  }

  // Own device must always appear in the share list so Syncthing treats this
  // as a local folder rather than an external share we're only relaying.
  const deviceIds = Array.from(new Set([myId, ...targets]));

  // Make sure the directory exists on disk before asking Syncthing to scan it.
  mkdirSync(opts.path, { recursive: true });

  const folder: SyncthingFolder = {
    id,
    label: id,
    path: opts.path,
    type: opts.type,
    // Match the defaults used by `generateConfig` so behaviour is consistent.
    rescanIntervalS: 10,
    fsWatcherEnabled: true,
    fsWatcherDelayS: 1,
    devices: deviceIds.map((deviceID) => ({ deviceID })),
  };

  // POST /rest/config/folders adds a single folder. The plural PUT endpoint
  // expects an array and would overwrite every folder at once, which is not
  // what we want. Syncthing documents POST as the "add one" shortcut.
  // See: https://docs.syncthing.net/rest/config.html#folder-endpoints
  await apiCall("POST", "/rest/config/folders", folder);

  logger.info("folder added", {
    id,
    path: opts.path,
    type: opts.type,
    deviceCount: deviceIds.length,
  });

  return {
    id,
    name: opts.name,
    path: opts.path,
    type: opts.type,
    deviceCount: deviceIds.length,
    devices: deviceIds,
    isDefault: isDefaultFolder(id),
    state: "unknown",
    synced: false,
  };
}

/**
 * List every botsync-managed folder with enough metadata to render a CLI
 * table. Non-botsync folders are intentionally skipped — `botsync status`
 * only manages our own namespace.
 */
export async function listFolders(): Promise<ManagedFolder[]> {
  const config = await getConfig();
  const managed = config.folders.filter((f) => f.id.startsWith(BOTSYNC_PREFIX));

  const result: ManagedFolder[] = [];
  for (const f of managed) {
    const devices = (f.devices || []).map((d) => d.deviceID);
    let state = "unknown";
    let synced = false;
    try {
      const s = await apiCall<FolderStatus>(
        "GET",
        `/rest/db/status?folder=${encodeURIComponent(f.id)}`,
      );
      state = s.state;
      synced = s.state === "idle" && s.needFiles === 0;
    } catch {
      // Folder added but not yet scanned — fall back to unknown.
    }

    result.push({
      id: f.id,
      name: nameForFolderId(f.id),
      path: f.path,
      type: String(f.type),
      deviceCount: devices.length,
      devices,
      isDefault: isDefaultFolder(f.id),
      state,
      synced,
    });
  }

  return result;
}

/**
 * Remove a folder from Syncthing config. Does not delete local files — the
 * on-disk directory is left alone so nothing important gets nuked.
 *
 * Refuses to remove the default `shared` folder: that's bootstrapped by
 * `botsync init` and the start-up flow expects it to exist.
 */
export async function removeFolder(name: string): Promise<void> {
  const id = folderIdFor(name);

  if (isDefaultFolder(id)) {
    throw new Error(
      "Cannot remove the default 'shared' folder. It is managed by `botsync init`.",
    );
  }

  const config = await getConfig();
  if (!config.folders.some((f) => f.id === id)) {
    throw new Error(`Folder '${name}' not found (id: ${id}).`);
  }

  await apiCall("DELETE", `/rest/config/folders/${encodeURIComponent(id)}`);
  logger.info("folder removed", { id });
}

/**
 * Add a peer device to an existing folder's share list. The peer must
 * already be paired via `botsync invite` / `botsync join`.
 */
export async function shareFolder(name: string, deviceId: string): Promise<void> {
  // We intentionally keep the device-id shape check loose. Syncthing's real
  // device ids are 56 chars, but the source of truth is "must already be
  // paired", which we check below. That check gives a much clearer error
  // than a format assertion.
  if (typeof deviceId !== "string" || deviceId.trim().length === 0) {
    throw new Error("Device id is required.");
  }

  const id = folderIdFor(name);
  const config = await getConfig();

  const paired = new Set(config.devices.map((d) => d.deviceID));
  if (!paired.has(deviceId)) {
    throw new Error(
      `Device ${deviceId.substring(0, 7)}... is not paired. Run 'botsync invite' first.`,
    );
  }

  const folder = config.folders.find((f) => f.id === id);
  if (!folder) throw new Error(`Folder '${name}' not found (id: ${id}).`);

  folder.devices = folder.devices || [];
  if (folder.devices.some((d) => d.deviceID === deviceId)) {
    // Already shared — no-op.
    return;
  }
  folder.devices.push({ deviceID: deviceId });

  // Round-trip the full config back (same approach used by addDeviceToFolder).
  await apiCall("PUT", "/rest/config", config);
  logger.info("folder shared with device", { id, deviceId });
}

/**
 * Remove a peer device from an existing folder's share list. Leaves the
 * device paired at the Syncthing level — this only affects one folder.
 */
export async function unshareFolder(name: string, deviceId: string): Promise<void> {
  const id = folderIdFor(name);
  const config = await getConfig();

  const folder = config.folders.find((f) => f.id === id);
  if (!folder) throw new Error(`Folder '${name}' not found (id: ${id}).`);

  const before = folder.devices?.length || 0;
  folder.devices = (folder.devices || []).filter((d) => d.deviceID !== deviceId);
  const after = folder.devices.length;

  if (after === before) {
    // Device wasn't sharing this folder — nothing to do, no API call needed.
    return;
  }

  await apiCall("PUT", "/rest/config", config);
  logger.info("folder unshared from device", { id, deviceId });
}
