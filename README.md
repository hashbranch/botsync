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

botsync can push notifications to [OpenClaw](https://openclaw.ai) whenever a file is synced or a new device connects. This lets your agent react to incoming files in real time.

### Setup

**1. Enable hooks in OpenClaw** — add to your `openclaw.json` (or equivalent config):

```json5
{
  "hooks": {
    "enabled": true,
    "token": "your-hooks-token"   // must differ from gateway.auth.token
  }
}
```

Restart the gateway after adding the hooks config.

**2. Set the token when running botsync:**

```bash
# Option A: Environment variables (set before init/join/start)
export OPENCLAW_HOOKS_TOKEN=your-hooks-token
npx botsync init

# Option B: The token is saved to config.json automatically on first run,
# so you only need the env var once — subsequent `botsync start` will use
# the saved config.
```

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_HOOKS_TOKEN` | Bearer token matching your `hooks.token` in OpenClaw config | — |
| `OPENCLAW_HOOKS_URL` | Webhook endpoint | `http://127.0.0.1:18789/hooks/agent` |

### What gets notified

- **File sync events** — batched notifications (2-second debounce) when files are received from a peer. Includes file paths and sizes.
- **Device connections** — immediate notification when a new device connects to the network.

### How it works

When configured, botsync starts a background events daemon that long-polls the Syncthing Events API. File sync events are batched and sent as a single webhook call. The agent receives a message like:

```
3 files have been synced via BotSync:
- ~/sync/shared/report.md (update, 4096 bytes)
- ~/sync/shared/data.csv (update, 12288 bytes)
- ~/sync/shared/notes.txt (update, 256 bytes)

Read and process as appropriate.
```

The webhook posts to `/hooks/agent` which wakes the agent and delivers the message. The agent can then read the synced files and act on them.

## Contributing

We use [GitHub Issues](https://github.com/hashbranch/botsync/issues) to track bugs, feature requests, and improvements. Check the issue list for open items — `good first issue` labels are a great starting point.

## License

MIT
