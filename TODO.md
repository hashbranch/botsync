# botsync — TODO

## Next Up
- [ ] `botsync start` command — restart daemon + heartbeat without reinit
- [ ] Deploy relay v0.3.0 to Cloudflare (`cd relay && wrangler deploy`)
- [ ] Publish v0.3.0 to npm
- [ ] Dashboard auth: read token from URL fragment, pass to /devices endpoint
- [ ] HN / Reddit launch post

## Security Hardening — DONE (v0.3.0)
- [x] Auth token on dashboard/heartbeat — Bearer token, sha256 validated
- [x] CORS locked to botsync.io (open only for /pair CLI endpoints)
- [x] Rate limit relay — 10/min POST /pair, 20/min GET /pair per IP
- [x] Bump passphrase to 5 words (~50 bits entropy)
- [x] File permissions 0o600 on config.json and network.json
- [x] Secret passed via env var (not CLI args) to heartbeat daemon

## Security Hardening (remaining)
- [ ] Dashboard JS: read token from URL fragment, pass to device list API
- [ ] Confirmation step before auto-accept — show device ID, require Y/N
- [ ] Optional PIN: `botsync init --pin 1234` (adds entropy on top of passphrase)
- [ ] Encrypted folders mode — Syncthing untrusted-device encryption
- [ ] Zero logging — confirm no device IDs or codes in Cloudflare logs

## Bug Fixes (from Deepak testing)
- [x] Stale daemon on re-init (cleanupStale in syncthing.ts)
- [x] Uncopyable offline passphrase (MAX_BOX_WIDTH in ui.ts)
- [x] Box misalignment (implicit fix from overflow handling)
- [ ] One-time-use codes consumed by failed join attempts — no retry

## CLI Polish
- [ ] Human-readable error when relay returns 401 ("re-pair required")
- [ ] `botsync status` should show heartbeat daemon status + dashboard URL
- [ ] `botsync stop` should confirm both Syncthing + heartbeat killed
- [ ] Handle stale config gracefully

## Dashboard
- [ ] Auth: read token from `#networkId:secret` URL fragment
- [ ] Show last-seen as relative time ("2 min ago")
- [ ] Show sync status per folder
- [ ] Network name/label (user-friendly name instead of UUID)

## Product (Deferred)
- [ ] Inbox protocol (claim files, approval gates)
- [ ] Manifests (describe what's in a folder)
- [ ] Bot-to-bot messaging via files
- [ ] Routing rules (file goes to folder X based on type)
- [ ] Schema validation on shared folders
- [ ] Landing page permanent hosting (here.now expires 24h)
