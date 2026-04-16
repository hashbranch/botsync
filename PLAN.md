# Feature Plan: Custom Folder Management

## Goal

Add first-class CLI commands to create, list, remove, share, and unshare
arbitrary sync folders on top of the existing single-folder default
(`botsync-shared`). All operations go through the running Syncthing REST API,
so stock Syncthing peers can still accept botsync-managed folders with no
special client on their side.

## Commands

Nested under a new `botsync folder` subcommand (commander supports this cleanly):

| Command                                           | Purpose                                             |
|---------------------------------------------------|-----------------------------------------------------|
| `botsync folder add <name> [flags]`               | Create folder, register with Syncthing, share it    |
| `botsync folder list`                             | Enumerate managed folders + sync state              |
| `botsync folder remove <name> [--force]`          | Unshare locally, keep files by default              |
| `botsync folder share <name> <deviceId>`          | Add peer to folder's share list                     |
| `botsync folder unshare <name> <deviceId>`        | Remove peer from folder's share list                |

### Flags for `add`

- `--path <path>`: where the folder lives on disk. Default: `~/sync/<name>`.
  Tilde expansion + created if missing.
- `--type <sendreceive|sendonly|receiveonly>`: default `sendreceive`.
- `--devices <id1,id2,...>`: comma list. Default: all currently paired peers
  (every device in Syncthing config other than `myID`).

After success, prints folder ID, path, type, peer count, and copy-paste
instructions for peers (including stock Syncthing peers) to accept the share.

## Naming rules (`validateFolderName`)

Reject if:
- empty / whitespace only
- contains `/`, `\`, or path separators
- starts with `.`
- longer than 64 chars
- not `[a-z0-9][a-z0-9-]*` after lowercasing (keep it simple + filesystem-safe)
- equals a reserved name: `shared`, `inbox`, `deliverables`, `botsync`, `.botsync`
  (the first three are current or deprecated defaults; `botsync` / `.botsync`
  would collide with internal state dirs).

Folder ID convention: `botsync-<name>` to match the existing
`botsync-shared` pattern. `list` treats any folder whose id starts with
`botsync-` as managed; `shared` is labelled "default", others are "custom".

## Modules

New files:

- `src/folders.ts` — pure-ish logic layer:
  - `validateFolderName(name)` → throws on invalid.
  - `folderIdFor(name)` → `botsync-<name>`.
  - `nameForFolderId(id)` → strips prefix.
  - `isDefaultFolder(id)` → id === `botsync-shared`.
  - `resolveFolderPath(name, override?)` → tilde expansion, absolute path,
    defaults to `<SYNC_DIR>/<name>`.
  - `addFolder({ name, path, type, devices })` → calls Syncthing API.
  - `listFolders()` → returns enriched managed folders + states.
  - `removeFolder(name)` → DELETE /rest/config/folders/<id>.
  - `shareFolder(name, deviceId)` → adds to folder's `devices` list.
  - `unshareFolder(name, deviceId)` → removes from folder's `devices` list.
  - `getPairedDevices()` → all config devices minus `myID`.
- `src/commands/folder.ts` — CLI glue for the 5 subcommands. Uses
  `src/folders.ts` for business logic and `src/ui.ts` for rendering.

Updated files:

- `src/cli.ts` — register `folder` parent command + 5 subcommands.
- `src/syncthing.ts` — export one small helper (`getFolderConfig(id)`) only if
  needed; otherwise reuse existing `apiCall` directly from `folders.ts`.
- `README.md` — new `### Folder Management` section + stock-Syncthing
  interop note.
- `CHANGELOG.md` — new `[Unreleased]` entry under a `Folder management`
  header.

## Tests (vitest, mocked Syncthing API)

`test/folders.test.ts`:

- `validateFolderName` — rejects slashes, reserved names (`shared`,
  `deliverables`, `inbox`, `botsync`, `.botsync`), empty, too long,
  uppercase-only, dot-prefixed. Accepts `tera`, `deal-data-2026`, etc.
- `folderIdFor` / `nameForFolderId` round-trip.
- `resolveFolderPath` — default, override, tilde expansion, absolute passthrough.
- `addFolder` — mocked fetch captures PUT payload:
  - folder id `botsync-<name>`, correct path, type, device list.
  - rejects reserved names before any API call.
  - includes own device ID + each peer.
- `listFolders` — mocked fetch returns mixed folders; only
  `botsync-*` IDs surface; default vs custom flagged.
- `removeFolder` — issues DELETE to correct path; errors if folder missing.
- `shareFolder` / `unshareFolder` — PUT config with devices list mutated;
  rejects when peer is not in known device list.

`test/cli-folder.test.ts` (optional, thin) — only if there's time; skip if
covered by `folders.test.ts`.

Mocking pattern: `vi.stubGlobal("fetch", vi.fn())` plus a temp `BOTSYNC_ROOT`
with a hand-written `config.json` so `apiCall` has an apiKey/port to read.
The fetch mock routes by method + URL and returns canned JSON.

## Workflow

1. Write PLAN.md (this file)
2. Write `test/folders.test.ts` (TDD)
3. Implement `src/folders.ts`
4. Implement `src/commands/folder.ts`
5. Register in `src/cli.ts`
6. `npm test` + `npm run build`
7. Update README + CHANGELOG
8. Commit in small, reviewable chunks:
   - plan
   - folders module + tests
   - CLI wiring
   - docs
9. Push branch + open PR targeting `dev` (not main)

## Stock Syncthing interop

Explicitly documented in the README. The reason it works:

- botsync-managed folders are plain Syncthing folders. No custom metadata.
- `botsync folder add --devices <stockDeviceId>` adds a peer just like the
  Syncthing web UI would.
- Stock Syncthing peers accept the incoming folder with Syncthing's built-in
  "accept folder share" flow (or with `autoAcceptFolders` which our own
  config enables by default).

No special client, no relay involvement beyond initial pairing. We'll call
this out in README.
