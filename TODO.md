# botsync — TODO

## Next Up
- [ ] `botsync start` command — restart daemon + heartbeat without reinit
- [ ] Publish v0.2.2 to npm with UI + join fixes
- [ ] Persistent heartbeat supervisor (single process wrapping Syncthing + heartbeat instead of two daemons)
- [ ] DNS CNAME for `relay.botsync.io` (currently on workers.dev route)
- [ ] Wire botsync-site repo to Cloudflare Pages for auto-deploy (currently manual `wrangler pages deploy`)

## Security Hardening (pre-launch blockers)
- [ ] Rate limit relay — POST `/pair` ~10/min, GET `/pair/:code` 5 failed/min per IP (CF rules or in-worker)
- [ ] Encrypt device IDs through relay — derive key from passphrase, relay stores ciphertext only
- [ ] Confirmation step before auto-accept — show connecting device ID, require Y/N instead of blind accept
- [ ] Auth token on dashboard/heartbeat — generated at init, required for `GET /network/:id/devices`
- [ ] Bump passphrase to 5-6 words (~40-48 bits entropy vs current ~32)

## Security Hardening (pre-launch nice-to-have)
- [ ] Optional PIN: `botsync init --pin 1234` (adds ~13 bits entropy on top of passphrase)
- [ ] Encrypted folders mode — leverage Syncthing's untrusted-device encryption for sensitive content
- [ ] Zero logging — confirm no device IDs or codes leak to Cloudflare logs

## CLI Polish
- [ ] Human-readable error when relay is down (currently falls back silently to base58)
- [ ] `botsync status` should show heartbeat daemon status + dashboard URL
- [ ] `botsync stop` should confirm both Syncthing + heartbeat killed
- [ ] Handle stale config gracefully (daemon died, config exists, user runs join)

## Dashboard
- [ ] Show last-seen as relative time ("2 min ago")
- [ ] Show sync status per folder (requires Syncthing API proxy or client-side polling)
- [ ] Network name/label (user-friendly name instead of UUID)

## Product (Deferred)
- [ ] Inbox protocol (claim files, approval gates)
- [ ] Manifests (describe what's in a folder)
- [ ] Bot-to-bot messaging via files
- [ ] Routing rules (file goes to folder X based on type)
- [ ] Schema validation on shared folders
- [ ] Landing page permanent hosting (here.now expires 24h)

## Known Bugs
- [x] Heartbeat dies when init/join exits (fixed: detached daemon in v0.2.1)
- [x] Join fails on existing config (daemon not running) (fixed: auto-restart in d671d97)
- [x] Mismatched checkmarks in CLI (ora ✔ vs our ✓) (fixed: d671d97)
- [x] Box drawing misaligned on right side (fixed: d671d97)
- [ ] One-time-use codes consumed by failed join attempts — no retry without new init
