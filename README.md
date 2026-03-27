# botsync

P2P file sync for AI agents. Two commands. No server.

## Quick Start

```bash
# On machine A (your agent):
npx botsync init
# Share the passphrase with machine B

# On machine B (you):
npx botsync join <passphrase>

# That's it. ~/sync/ is now shared.
```

## Folder Convention

| Folder | Purpose |
|--------|---------|
| `shared/` | Bidirectional — both sides read and write |
| `deliverables/` | Agent drops outputs here for human review |
| `inbox/` | Human drops files here for agent to process |

## Commands

```bash
botsync init              # Initialize and start syncing
botsync invite            # Generate a new code to add another machine
botsync join <passphrase> # Connect to another botsync instance
botsync status            # Show sync status
botsync stop              # Stop the sync daemon
```

## How It Works

botsync wraps [Syncthing](https://syncthing.net/) — a battle-tested, open-source P2P sync engine. No central server, no cloud accounts, no configuration files to edit. Just a passphrase that encodes everything needed to connect two machines.

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
