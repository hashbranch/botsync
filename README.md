# botsync

[![npm version](https://img.shields.io/npm/v/botsync)](https://www.npmjs.com/package/botsync)
[![npm downloads](https://img.shields.io/npm/dw/botsync)](https://www.npmjs.com/package/botsync)
[![CI](https://github.com/hashbranch/botsync/actions/workflows/ci.yml/badge.svg)](https://github.com/hashbranch/botsync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Peer-to-peer file sync for AI agents. Two commands. No server. No account. No cloud.

botsync pairs two (or more) machines so they share a folder in real time. Built for the world where AI agents run on your machine and need to exchange files with you or with each other — without routing through someone else's server.

## Quick Start

```bash
# On machine A (your agent):
npx botsync init
# Share the passphrase with machine B

# On machine B (you):
npx botsync join <passphrase>

# That's it. ~/sync/ is now shared.
```

## Folder Structure

```
~/sync/
├── BOTSYNC.md      # Manifest — tells agents what this folder is
├── shared/         # Read and write freely, all peers see changes
└── .botsync/       # Internal state (do not modify)
```

`shared/` is the default sync folder. Organize it however you like — create subdirectories for tasks, output, data, etc. A `BOTSYNC.md` manifest is created at init to guide any agent that lands in the folder.

## Commands

```bash
botsync init              # Initialize and start syncing
botsync invite            # Generate a new code to add another machine
botsync join <passphrase> # Connect to another botsync instance
botsync start             # Restart daemons (after reboot or stop)
botsync status            # Show sync status and version
botsync update            # Check for updates and install latest
botsync stop              # Stop the sync daemon
```

## How It Works

botsync wraps [Syncthing](https://syncthing.net/) — a battle-tested, open-source P2P sync engine. No central server, no cloud accounts, no configuration files to edit.

1. `botsync init` downloads Syncthing, generates config, starts the daemon, and prints a 5-word pairing code
2. The code is stored on a temporary relay (10-minute TTL, one-time use)
3. `botsync join <code>` resolves the code, sets up the local Syncthing instance, and connects to the first machine
4. Files in `~/sync/` now sync in real time between both machines
5. To add more machines, run `botsync invite` on any paired machine

### Architecture

```
Machine A                    Relay                     Machine B
    |                          |                          |
    |--- botsync init -------->|                          |
    |    (stores device ID)    |                          |
    |<-- 5-word code ----------|                          |
    |                          |                          |
    |                          |<---- botsync join -------|
    |                          |      (resolves code)     |
    |                          |----> device ID ---------->|
    |                          |                          |
    |<========== Syncthing P2P (encrypted) =============>|
    |           (relay no longer involved)                |
```

The relay is only used for the initial handshake. All file transfer is direct, peer-to-peer, encrypted with TLS.

## Conflicts

Syncthing handles conflicts automatically. If the same file is modified on two machines before they sync:

- The most recent version wins and becomes the synced file
- The other version is saved as `<filename>.sync-conflict-<date>-<id>.<ext>`
- Conflict files appear in the same folder — nothing is lost

To minimize conflicts, avoid editing the same file on multiple machines simultaneously. Use subdirectories to give each machine or agent its own workspace.

## OpenClaw Notifications

botsync can push notifications to [OpenClaw](https://openclaw.ai) whenever a file is synced or a new device connects. This is opt-in — set the token to enable it.

```bash
export OPENCLAW_HOOKS_TOKEN=<your-token>
export OPENCLAW_HOOKS_URL=http://127.0.0.1:18789/hooks/agent  # default
```

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_HOOKS_TOKEN` | Bearer token for the webhook (required) | — |
| `OPENCLAW_HOOKS_URL` | Webhook endpoint | `http://127.0.0.1:18789/hooks/agent` |

When configured, botsync sends batched notifications for file sync events (debounced by 2 seconds) and immediate notifications when a new device connects.

## Contributing

We use [GitHub Issues](https://github.com/hashbranch/botsync/issues) to track bugs, feature requests, and improvements. Check the issue list for open items — `good first issue` labels are a great starting point.

## License

MIT
