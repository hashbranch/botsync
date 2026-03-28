# Security

## Reporting Vulnerabilities

If you discover a security vulnerability, please email security@hashbranch.com. Do not open a public issue.

We will acknowledge your report within 48 hours and aim to release a fix within 7 days for critical issues.

## Threat Model

botsync pairs machines for peer-to-peer file sync. Here's what we protect against, and what we don't.

### Trust Boundaries

1. **Pairing codes** are the trust boundary. Anyone with the code can join your network. Codes are one-time use and expire after 10 minutes.
2. **The relay** (`relay.botsync.io`) temporarily stores device IDs during pairing. It stores `sha256(networkSecret)`, never the plaintext. Pairing data is deleted immediately after retrieval.
3. **Syncthing** handles all file transfer. Traffic is encrypted with TLS. Device identity is verified via Ed25519 certificates. See [Syncthing's security model](https://docs.syncthing.net/users/security.html).
4. **Your machine** is trusted. botsync stores config at `~/sync/.botsync/` with 0600 permissions. The network secret is passed to background daemons via environment variables, not CLI arguments (which would be visible in `ps` output).

### What We Protect Against

- **Eavesdropping on sync traffic** — Syncthing encrypts all transfers with TLS.
- **Relay compromise** — The relay never sees your files. It only brokers the initial handshake. Network secrets are stored as sha256 hashes.
- **Brute-forcing pairing codes** — 5-word codes from a 1024-word list give ~50 bits of entropy. The relay rate-limits to 20 lookups per IP per minute. Codes are one-time use.
- **Stale process leaks** — botsync cleans up orphaned Syncthing processes on re-init.

### What We Don't Protect Against

- **Compromised machines** — If an attacker has access to your machine, they can read `~/sync/` and `~/sync/.botsync/config.json`. botsync is not a security tool; it's a sync tool.
- **Physical access to pairing codes** — If someone sees your pairing code before it's used, they can join your network. Share codes through a trusted channel.
- **Relay availability** — If the relay is down, pairing falls back to base58-encoded offline passphrases (longer, but still work). Existing syncs are unaffected.

## Security Practices

- Config files (`config.json`, `network.json`) are written with `0600` permissions
- Network secrets are passed via env vars, not CLI args
- The relay uses constant-time hash comparison to prevent timing attacks
- Rate limiting on pairing endpoints (10 creates/min, 20 lookups/min per IP)
- CORS is locked to `botsync.io` for dashboard endpoints; open only for CLI pairing
