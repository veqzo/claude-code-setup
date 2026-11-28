# Paseo config sources

The Paseo daemon reads `~/.paseo/config.json` as plain JSON. This folder holds the commented sources for that file.

| File | Content |
| --- | --- |
| `config.base.jsonc` | Settings for every host: relay, profiles, providers, plugins |
| `hosts/windows-pc.jsonc` | Host #1, the Windows PC |
| `hosts/vps.jsonc` | Host #2, the container on the VPS |
| `schema/paseo.config.v1.json` | Copy of https://paseo.sh/schemas/paseo.config.v1.json (Paseo 0.17.5, checked 2026-11-26) |
| `plugins/quota-guard/` | Custom plugin: active Google account, caps, fallback, notifications |

## Build

Short way: `node ~/.claude/scripts/setup/apply.js --host windows-pc` pulls `~/.claude`, runs the agent sync and runs the steps below. It asks you to quit the app and writes only after the daemon is down. On the VPS host use `docker/paseo-vps/apply.sh`.

By hand:

1. Stop the daemon (Desktop: quit the app; VPS: `docker compose stop paseo`).
2. Preview: `node ~/.claude/scripts/paseo/build-config.js --host windows-pc --dry-run`
3. Write: the same command without `--dry-run`. The old file stays as `config.json.bak`.
4. Start the daemon again.

The build keeps the keys that the daemon owns: `daemon.auth`, `pluginsEnabled`, relay endpoints and installed plugins. It never turns on `pluginsEnabled`. It prints key paths only, never values. `--check` exits with 1 when the file is out of date.

## Refresh the schema

Download the schema again after a Paseo update and run the tests:

```
curl -fsSL https://paseo.sh/schemas/paseo.config.v1.json -o ~/.claude/paseo/schema/paseo.config.v1.json
node --test ~/.claude/scripts/paseo/build-config.test.js
```
