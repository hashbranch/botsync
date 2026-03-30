# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Botsync

Botsync is a CLI tool (`npx botsync`) that pairs two machines for peer-to-peer file sync using Syncthing under the hood. No accounts, no cloud storage. Two components:
- **CLI** (`src/`) — Node.js CLI built with Commander, published to npm
- **Relay** (`relay/`) — Cloudflare Worker for pairing codes and network dashboard

## Commands

```bash
# CLI
npm run build          # TypeScript → dist/ (CommonJS)
npm test               # Vitest suite (test/**/*.test.ts)
npx vitest run test/config.test.ts  # Run a single test file

# Relay
cd relay && npm run build   # Type-check relay worker
cd relay && npm test        # Relay integration tests
```

## Git Workflow

- **`main`** is the release branch. Merging to main triggers a release via CI/CD (tag `v*` → npm publish + relay deploy + site deploy).
- **`dev`** is the integration branch. All feature work accumulates here.
- **Feature branches** are created off `dev` and merged back to `dev` via PR.
- When ready to release, merge `dev` → `main` and tag.
- Never branch off `main` for new work. Never push directly to `main`.

## Architecture

**CLI flow:** `cli.ts` (Commander) → `commands/{init,join,invite,status,stop}.ts` → core modules

**Core modules:**
- `config.ts` — Paths and config I/O. `BOTSYNC_ROOT` env var overrides default `~/sync/`. Config files stored at `~/sync/.botsync/`, binaries cached at `~/.botsync/bin/`
- `syncthing.ts` — Binary download (GitHub releases), XML config generation (template-based, no parsing), daemon lifecycle (detached child process), REST API wrapper
- `passphrase.ts` — Two pairing modes: relay word codes (5 words from 1024-word list = ~50 bits) with offline Base58 fallback
- `peer-discovery.ts` — Shared peer polling and auto-accept logic, used by both `init` and `invite`
- `heartbeat.ts` / `heartbeat-daemon.ts` — Background process that pings relay every 60s. Network secret passed via env var `BOTSYNC_NETWORK_SECRET`, not CLI args
- `events.ts` / `events-daemon.ts` — Opt-in OpenClaw webhook notifications for file sync and device connections. Requires `OPENCLAW_HOOKS_TOKEN` env var or `webhookToken` in config.
- `ui.ts` — Terminal output (chalk v4 + ora v5, both CJS-compatible versions)

**Relay endpoints:**
- `POST /pair` → store device info, return word code (10-min TTL, one-time use)
- `GET /pair/:code` → retrieve and delete device info
- `POST /network/:id/heartbeat` → register device (Bearer auth, sha256 hashed)
- `GET /network/:id/devices` → list devices (Bearer auth via query param)

State stored in Cloudflare KV (`PAIRS` and `NETWORKS` namespaces).

## Folder Structure

The `~/sync` directory (default sync root) contains:
- `shared/` — the sync folder. All peers read and write. Users organize within it as they like.
- `BOTSYNC.md` — manifest file generated at init. Tells agents what this folder is and how to use it.
- `.botsync/` — internal state (config, PID files, Syncthing data). Do not modify.

## Key Conventions

- **CommonJS throughout CLI** — chalk v4 and ora v5 are used specifically for CJS compat. Don't upgrade to ESM versions.
- **Syncthing config is template XML** — Intentionally avoids XML parsing. The config is generated from string templates in `syncthing.ts`.
- **File permissions matter** — `config.json` and `network.json` must be written with `0o600`. Tests verify this.
- **Detached daemons** — Syncthing, heartbeat, and events all run as detached child processes that outlive the CLI. PID files track them for later cleanup.
- **Tests use BOTSYNC_ROOT** — Set this env var to a temp directory to isolate tests from the real `~/sync/`.
- **Rate limiting in relay** — Per-IP KV counters with 60s TTL windows. Endpoints have different limits.

## Workflow (gstack)

Use gstack skills for the development workflow:
- `/plan-ceo-review` → `/plan-eng-review` → build → `/review` → `/qa` → `/ship`
- `/cso` for security audits, `/retro` for retrospectives, `/investigate` for debugging

## TypeScript Config

- CLI: `target: ES2022`, `module: Node16`, strict mode, declarations emitted
- Relay: `target: ES2022`, `module: ES2022`, `moduleResolution: bundler` (Wrangler)

## CI/CD

- **ci.yml** — Builds and tests both CLI and relay on push/PR to main (Node 20)
- **release.yml** — On `v*` tags: npm publish + Wrangler deploy relay + deploy site (separate botsync-site repo)
