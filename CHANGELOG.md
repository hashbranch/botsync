# Changelog

## [Unreleased] - dev

### Added
- **`botsync id`** — Print this machine's full Syncthing device ID on stdout. `botsync status` only shows the first 7 chars for display; pairing (botsync or vanilla Syncthing) needs the full 56-char ID, and previously the only way to get it was grepping `~/sync/.botsync/config.json`. Pipeable: `npx botsync id | pbcopy`.
- **`botsync folder` subcommands** to manage sync folders beyond the default `shared/`:
  - `folder add <name> [--path] [--type] [--devices]` creates a new folder, creates the local directory if missing, and shares it with paired peers (or a specified subset).
  - `folder list` shows every botsync-managed folder with its path, type, peer count, and sync state. Marks the default `shared` vs user-added folders.
  - `folder remove <name> [--force]` unshares locally while keeping the on-disk files (confirmation prompt unless `--force`).
  - `folder share <name> <deviceId>` / `folder unshare <name> <deviceId>` add or remove a paired peer on an existing folder.
  - All five commands go through Syncthing's REST API, so stock Syncthing peers can accept the resulting folder shares without a special client.
- **`src/folders.ts`**: typed API for folder management with validation (rejects slashes, dot-prefixes, reserved names `shared`/`inbox`/`deliverables`/`botsync`), plus 27 vitest unit tests with mocked Syncthing responses.

### Changed
- **Auto-accepted folders land under `~/sync/`.** Added a `<defaults><folder>` block to the generated Syncthing config so any folder shared by a peer (e.g. via `botsync folder share`) auto-accepts at `<sync_root>/<folderID>/` instead of Syncthing's compiled-in default of `~/<folderID>/`. Without this, a peer who hadn't pre-created the folder via `botsync folder add` ended up with files dumped at the wrong path under their home directory. Existing networks are unaffected — the change only takes effect for new `botsync init` runs (or after manually editing `config.xml`).

## [0.4.0]

### Added
- **`botsync invite`** — Generate a fresh pairing code to add another machine without reinitializing. Solves the one-time-use code problem.
- **OpenClaw event notifications** — Opt-in webhook daemon pushes file sync and device connection events to your OpenClaw agent. Batched (2s debounce), health-checked, exits if Syncthing dies. Set `OPENCLAW_HOOKS_TOKEN` to enable.
- **Peer discovery module** — Extracted shared peer polling logic into `peer-discovery.ts`, used by both `init` and `invite`.

### Changed
- `botsync status` now shows events daemon status when configured.
- `botsync stop` gracefully stops the events daemon alongside heartbeat and Syncthing.

## [0.3.1] - 2026-03-27

### Added
- **Security hardening** — Network secrets (Bearer auth on relay), sha256 hash storage, timing-safe comparison, CORS locked to botsync.io, rate limiting (10/min POST, 20/min GET).
- **1024-word list** — Upgraded from 256 words for 5-word pairing codes (50-bit entropy, up from 32-bit).
- **Dashboard auth** — URL fragment `#networkId:secret` required to view devices.
- **52 tests** — 32 CLI unit tests + 20 relay integration tests.
- **CI/CD** — GitHub Actions: CI on push/PR, release on `v*` tags (npm publish + relay deploy + site deploy).

### Fixed
- Stale Syncthing daemon cleanup on re-init (PID file + pkill fallback).
- Passphrase box overflow for long base58 strings (skips box when line > 70 chars).
- Box drawing misalignment.

## [0.3.0] - 2026-03-27

Initial security-hardened release. Same content as 0.3.1 (tag push issue).

## [0.2.1] - 2026-03-25

### Added
- Persistent heartbeat daemon (60s interval, auto-exits when Syncthing dies).
- Dashboard at botsync.io showing linked devices.
- Landing page at botsync.io.

## [0.1.0] - 2026-03-25

Initial release. P2P file sync via Syncthing with pairing codes.
