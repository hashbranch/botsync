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
botsync join <passphrase> # Connect to another botsync instance
botsync status            # Show sync status
botsync stop              # Stop the sync daemon
```

## How It Works

botsync wraps [Syncthing](https://syncthing.net/) — a battle-tested, open-source P2P sync engine. No central server, no cloud accounts, no configuration files to edit. Just a passphrase that encodes everything needed to connect two machines.
