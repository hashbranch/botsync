# botsync — TODO

## Relay Security
- [ ] Rate limit POST `/pair` — ~10/min per IP (Cloudflare built-in)
- [ ] Rate limit GET `/pair/:code` — 5 failed lookups per IP per minute
- [ ] Optional PIN: `botsync init --pin 1234`, joiner provides `botsync join code --pin 1234` (adds ~13 bits entropy)
- [ ] Zero logging — confirm no device IDs or codes leak to Cloudflare logs

## CLI
- [ ] `botsync start` command — restart daemon without reinit (config already exists)
- [ ] `botsync stop` on join side (currently only init gets a clean stop)
- [ ] Human-readable error when relay is down (currently falls back silently to base58)

## Relay Deployment
- [ ] `wrangler login` + create KV namespace
- [ ] Deploy worker to `relay.botsync.io`
- [ ] DNS: add `relay` CNAME on botsync.io → worker
- [ ] Custom domain route in `wrangler.toml`

## Product (Deferred)
- [ ] Inbox protocol (claim files, approval gates)
- [ ] Manifests (describe what's in a folder)
- [ ] Presence/heartbeat (know when peer is online)
- [ ] Bot-to-bot messaging via files
- [ ] Routing rules (file goes to folder X based on type)
- [ ] Schema validation on shared folders
- [ ] `npx botsync` zero-install experience (publish to npm)
- [ ] Landing page permanent hosting (here.now expires 24h)

## Known Bugs
- [ ] Pairing is one-way without relay — init never learns joiner's device ID (relay fixes this)
- [ ] `/tmp` worktree fragility if OS cleans temp (not botsync-specific, but affects any temp builds)
