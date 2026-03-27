# Changelog

## [0.4.0] - Unreleased (dev)

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
