# quota-guard (Paseo plugin)

Picks the Google account for new Antigravity agents, falls back between Gemini and Claude at a usage cap, and sends alerts. It never rotates accounts by itself: the account switch is manual.

## What it does

| Hook | Action |
| --- | --- |
| `agent.create.before` | Antigravity agent: enables file-based sign-in storage. For an account with its own home (`~/.agy-homes/<id>`) it sets `HOME` and `USERPROFILE` to that home, and `GIT_CONFIG_GLOBAL` (and `GH_CONFIG_DIR` on Linux) back to the real home. agy 1.5.18 ignores `ANTIGRAVITY_APP_DATA_DIR`, so HOME selects the account. A home outside `~` and `~/.agy-homes/`, or a missing home, blocks the agent. At the Gemini cap: starts the agent on Claude instead. Claude agent at the Claude cap: starts it on Gemini. If both are capped or fallback is off, blocks agent creation and sends an alert. Internal helper agents are skipped. |
| `agent.create.after` | Alert for each fallback, opens the agent on tap. |
| `agent.turn.after` | Detects "usage limit reached" (Claude) and `RESOURCE_EXHAUSTED` (Gemini) in a short final reply or a failed turn. Marks the provider or account as capped until the reported reset, or one hour as an estimate. |

A fallback keeps the mode but never raises autonomy: `full-access` and `bypassPermissions` become accept-edits. Paseo stores the env per agent, so a running or resumed agent keeps the account it started with.

## Data sources

- Gemini: `agy -p /usage --output-format json` per account, every `pollSeconds` (default 300). The official Antigravity provider uses the same command. The published 0.17.5 plugin SDK's usage list omits the account keys, so the guard runs the command with each account's own environment. `geminiUsageGroups` matches a literal part of the group name (default `gemini`). The tested agy 1.5.18 account reported only a weekly window for "Gemini Models".
- Claude: `paseo.providers.listUsage()` (the Paseo usage report), refreshed in hooks when older than one interval.
- Values older than two intervals and values from limit messages show as "estimate".

## Settings

Settings > Quota guard on any client of the host. The command center item "Switch Gemini account" opens the same screen. Settings are per host.

| Key | Default |
| --- | --- |
| `accounts` | `a` = `~`, `b` = `~/.agy-homes/b` (the agy HOME per account). `scripts/setup/agy-homes.js` creates the B home. Settings version 2 migrates the old `~/.gemini/antigravity-cli*` values. |
| Caps | Gemini 90 % / 90 % per account, Claude 85 % (5h) / 80 % (weekly). Select a Google account to edit its caps. |
| `fallback` | on, `claude-sonnet-5-5` and `gemini-4-hydrogen` |
| `ntfy` | off, `https://ntfy.sh`, empty topic |

Daemon environment (OpenBao on the PC, the compose env file on the VPS), never settings:

| Variable | Use |
| --- | --- |
| `NTFY_TOKEN` | ntfy access token (optional for a public topic) |
| `NTFY_URL` | The only origin that receives the token, e.g. `https://ntfy.example.com` |
| `AGY_COMMAND` | agy executable, default `agy` |

The daemon environment controls the executable and allows the configured HTTPS ntfy origin. The settings can also use the public `https://ntfy.sh` origin. Requests refuse redirects and only attach the token to the configured origin.

Push alerts through the Paseo apps need plugin notifications, which the published 0.17.5 SDK does not have yet. The plugin detects the API at runtime and reports "unsupported" until then; ntfy works on every version.

## Develop

```
npm install
npm run typecheck
npm test
```

Paseo bundles the sources itself. `node_modules` is for the type check only and stays out of git.
