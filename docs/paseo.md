# Paseo with Claude Code and the Antigravity CLI

This is how I run several coding agents from one place. [Paseo](https://paseo.sh) runs as a host on my Windows PC and in a Docker container on a VPS. Paseo Desktop on the Mac, the iPhone and the iPad connect to both hosts through Paseo's end-to-end encrypted relay. Claude Code plans and reviews. Gemini, through the Antigravity CLI (`agy`), implements the plan in a git worktree. I choose the Google account per host by hand. When one provider reaches its cap, the other one can take **new** agents.

```text
Paseo Desktop / iPhone / iPad
            │ end-to-end encrypted Paseo relay
            ├── Windows PC → local repo + worktrees → Claude Code and agy
            └── VPS        → /workspace + worktrees → Claude Code and agy
                                     │
                            GitHub through gh, every push approved
```

All files for this live under [`setup/`](../setup/) with the same paths they have in `~/.claude`. The scripts expect `~/.claude` to be a git checkout of **your own private** config repo (see the optional sync in [INSTALL.md](../INSTALL.md)). Copy the Paseo parts into that repo first, then follow the steps below. Placeholders: `<owner>/<config-repo>` is your private config repo, `<app>` is the Dokploy app folder.

| Path in this repo | What it is |
| --- | --- |
| [`setup/paseo/`](../setup/paseo/) | Commented JSONC sources for `~/.paseo/config.json`: base config, one overlay per host, the pinned schema |
| [`setup/paseo/plugins/quota-guard/`](../setup/paseo/plugins/quota-guard/) | Paseo plugin: Google account per host, caps, fallback, ntfy alerts |
| [`setup/paseo/plugins/github-repo-access/`](../setup/paseo/plugins/github-repo-access/) | Paseo plugin: checks if the VPS token can read a repo |
| [`setup/scripts/paseo/build-config.js`](../setup/scripts/paseo/build-config.js) | Builds and validates `~/.paseo/config.json` from the JSONC sources |
| [`setup/scripts/setup/apply.js`](../setup/scripts/setup/apply.js) | One command per PC: pull `~/.claude`, sync agents, rebuild the Paseo config |
| [`setup/scripts/setup/agy-homes.js`](../setup/scripts/setup/agy-homes.js) | Creates a separate HOME for the second Google account |
| [`setup/scripts/agents/`](../setup/scripts/agents/) | `sync-agents.js`: turns `~/.claude` into Codex and agy config, plus the agy implementer contract |
| [`setup/docker/paseo-vps/`](../setup/docker/paseo-vps/) | Dockerfile, compose file, bootstrap and apply scripts for the VPS host |

## Accounts and cost

- **Claude:** sign in on both hosts with the same Claude Pro subscription. Both hosts share its usage limit. Leave **Extra usage** off if you do not want extra cost. Do not use an API key.
- **Antigravity:** each host uses the sign-in of the official CLI. Leave paid credits and pay-as-you-go off. I have two Google AI subscriptions, and their limits are independent.
- **Codex** is in the setup as a temporary third provider. To remove it, set `agents.providers.codex.enabled` to `false` in [`config.base.jsonc`](../setup/paseo/config.base.jsonc) and remove the Codex part of `sync-agents.js`.

> [!WARNING]
> **Google can suspend Antigravity accounts.** The [Antigravity FAQ](https://antigravity.google/docs/faq#can-i-use-antigravity-cli-headless-mode-in-third-party-coding-agents-or-automate-account-switching) excludes headless CLI use inside third-party coding agents and automated account switching for consumer plans. Section 6 of the [additional terms](https://antigravity.google/terms) names suspension or termination as a possible result of access through third-party software. Paseo describes its provider as an ACP integration with the official CLI, but I found no explicit permission for Paseo with a consumer Google plan. quota-guard never switches accounts by itself, but a manual switch does not remove the third-party risk. The safe path is Claude in Paseo, and Gemini only in the official Antigravity app or CLI. Decide this for your own accounts.

## Roles and routing

| Job | Tool | Paseo profile |
| --- | --- | --- |
| Plan, debug hard problems, review | Claude Code (Opus for plans) | `planner`, `reviewer-claude` |
| Implement a clear plan (about 65 % of the implementation work) | agy with Gemini | `implementer`, or `implementer-fast` for one or two files with a clear test |
| Implement when both Google accounts are at their cap | Claude Code (Sonnet) | `implementer-claude` |
| Review a larger diff, read only | agy in plan mode | `reviewer` |
| Review a security, data or release diff, read only | Claude Code (Sonnet, plan mode) | `reviewer-claude` |

Why the split: the Claude subscription is the bottleneck, and two Google subscriptions have room. So Claude does the work that needs judgment, and Gemini does the typing. Small changes Claude makes directly, because a brief would cost more than the change.

The brief to Gemini has five parts: task, files, contract, check command and limits. Gemini ends every task with a fixed block:

```text
STATUS: done | partial | blocked
CHANGED: <file paths, comma-separated>
CHECK: <command you ran> -> <pass | fail: short reason>
COMMITS: <short hashes, or none>
NOTES: <max 3 short lines: open points, risks, questions>
```

If the brief is unclear, Gemini stops with `STATUS: blocked` and a question instead of guessing. It may not change tests to make them pass, and it never pushes. The contract is in [`agy-extra.md`](../setup/scripts/agents/agy-extra.md), and `sync-agents.js` writes it into the agy rules. Claude runs the check again and reads the diff before anything is merged.

## Windows PC as a host

1. Install Paseo Desktop, Git for Windows, `gh`, Node.js, Claude Code and agy. This setup was built with Paseo 0.17.5, Claude Code 2.1.332 and agy 1.5.18. Check `Get-Command claude,agy,gh,node`. Restart Paseo after you change `PATH`. Native Windows keeps worktrees, the IDE and the CLIs on one file system. WSL2 is optional.
2. Sign in with `gh auth login` and run `gh auth setup-git`. Keep `~/.claude` on the branch `master` (`git -C "$HOME/.claude" branch --show-current`). The apply script pulls only on that branch. `CLAUDE_CONFIG_BRANCH` selects another one.
3. Sign in to Claude Code with `claude` and `/login`. Sign in to agy for account A in its own PowerShell window, then close the window:

   ```powershell
   $env:SSH_CONNECTION = 'paseo'
   $env:AGY_CLI_FORCE_FILE_TOKEN_STORAGE = '1'
   agy
   ```

   Account B needs its own HOME, because agy 1.5.18 ignores `ANTIGRAVITY_APP_DATA_DIR`. `agy-homes.js` creates `~/.agy-homes/b` and links the shared `~/.gemini/config` (rules, hooks, skills) into it. Open the sign-in URL in a private browser window and sign in there with account B. Otherwise the sign-in page uses the account that is active in your browser.

   ```powershell
   node "$HOME/.claude/scripts/setup/agy-homes.js"
   $b = Join-Path $HOME '.agy-homes/b'
   $env:HOME = $b; $env:USERPROFILE = $b
   $env:SSH_CONNECTION = 'paseo'
   $env:AGY_CLI_FORCE_FILE_TOKEN_STORAGE = '1'
   agy
   ```

   If the agy banner then shows account A, delete `~/.agy-homes/b/.gemini/antigravity-cli/antigravity-oauth-token` and sign in again.

4. Apply the config. Use a separate PowerShell window, not a Paseo session, because a Paseo session ends when you quit Paseo. Look at the preview first.

   ```powershell
   node "$HOME/.claude/scripts/setup/apply.js" --host windows-pc --dry-run
   node "$HOME/.claude/scripts/setup/apply.js" --host windows-pc
   ```

   The script pulls `~/.claude`, runs `sync-agents.js` and checks `~/.paseo/config.json`. If the file is stale, it asks you to quit Paseo (**tray icon → Quit**). It never stops Paseo itself. Each step reports `ok`, `changed`, `preview`, `skipped` or `failed`, and the last line must be `Done.`. Start Paseo again. Use the same script for every later update.

5. Set the absolute agy path as `AGY_COMMAND` for quota-guard, then restart Paseo:

   ```powershell
   [Environment]::SetEnvironmentVariable('AGY_COMMAND', (Get-Command agy).Source, 'User')
   ```

6. In **Settings → Plugins**, allow plugin execution and check that **Quota guard** is loaded. Check that **Usage** shows Claude values. Add your project checkouts with **Add project**.
7. Create a pairing link in **Settings → Host → Devices → Relay**. Set a client password in the host security settings if you want one. See [Paseo: connectivity](https://paseo.sh/docs/connectivity) and [security](https://paseo.sh/docs/security).

## VPS as a host

The VPS host is a Docker container that I deploy with Dokploy. It has no domain, no published port and no Docker socket. It only connects out to the relay and to GitHub.

1. Create two fine-grained GitHub tokens with **Only select repositories** and store them in your secret manager:
   - `GH_TOKEN`: **Contents** and **Pull requests** read and write for your project repos. Add **Issues** read and write if agents should work on issues. Do not include the config repo.
   - `CLAUDE_CONFIG_READ_TOKEN`: **Contents** read only for `<owner>/<config-repo>`. The container pulls its settings, hooks and skills with it and can never push them.
2. Create a Compose service in Dokploy from your config repo, branch `master`, path `docker/paseo-vps/compose.yaml`. Fill the variables from [`.env.example`](../setup/docker/paseo-vps/.env.example) through your secret manager. Set no domain and no port. Make sure agent branches cannot trigger production deploys.
3. Deploy and wait for **healthy** (`docker inspect -f '{{.State.Health.Status}}' paseo`). Then run the bootstrap once from the VPS host shell. It sets up `gh` for git, clones `~/.claude` with the read token and installs rules, hooks and skills for agy:

   ```sh
   docker exec -it --user paseo paseo paseo-vps-bootstrap <owner>/<config-repo>
   ```

4. Write the Paseo config with the apply script from the Dokploy checkout (`ls -d /etc/dokploy/compose/*/code/docker/paseo-vps`):

   ```sh
   bash /etc/dokploy/compose/<app>/code/docker/paseo-vps/apply.sh
   ```

   It pulls `~/.claude` in the container and runs the agy sync. If the Paseo config is stale, it shows the changed keys and asks. Then it stops the container, writes the file from a one-off container without network, and starts the container again. Always run the copy from the Dokploy checkout, never the one in the container volume, because agents can change the volume.

5. Sign in to Claude Code with `docker exec -it --user paseo paseo claude` and `/login`. Sign in to agy for account A:

   ```sh
   docker exec -it --user paseo -e SSH_CONNECTION=paseo -e AGY_CLI_FORCE_FILE_TOKEN_STORAGE=1 paseo agy
   ```

   Account B uses `/home/paseo/.agy-homes/b`. Use a private browser window again:

   ```sh
   docker exec --user paseo paseo node /home/paseo/.claude/scripts/setup/agy-homes.js
   docker exec -it --user paseo -e HOME=/home/paseo/.agy-homes/b -e SSH_CONNECTION=paseo \
     -e AGY_CLI_FORCE_FILE_TOKEN_STORAGE=1 paseo agy
   ```

   agy shows the account at start. A and B must show different accounts.

6. Create the pairing link with `docker exec -it --user paseo paseo paseo daemon pair`. Pair one client and allow plugins as on Windows.
7. Clone projects as user `paseo`, for example `docker exec -it --user paseo paseo gh repo clone <owner>/<project> /workspace/<project>`, and add `/workspace/<project>` in Paseo. Docker-based integration tests run on the PC or in CI.
8. Keep both volumes on updates. `paseo-home` holds sign-ins, Paseo data, config and worktrees. `paseo-workspace` holds the project checkouts. Treat a backup of them like credentials. Details are in the [VPS reference](../setup/docker/paseo-vps/README.md).

> [!IMPORTANT]
> Agents and the daemon share the user `paseo` in the container. An agent with shell access can read the local sign-ins, files and the daemon API. The limit for GitHub writes is the token scope plus branch protection. Keep deploy keys and production credentials out of the container. Worktrees separate work, they are not a security boundary.

### GitHub writes from a session

1. Claude writes, checks and commits in the project worktree. That needs no approval.
2. For a push, Claude shows the target repo and branch, and you approve the command once in the Claude Code dialog in Paseo. Creating, updating or commenting on a PR is another approval. This works from the phone too.
3. Merging a PR needs its own approval. If the merge triggers a production deploy, you do it yourself.

The `ask` rules in [`settings.json`](../setup/settings.json) make these dialogs appear. The `/ship` skill approves one push of the current feature branch, and `/release` asks before each push.

## Paseo config

Edit only the JSONC sources, never `~/.paseo/config.json` directly. `build-config.js` merges [`config.base.jsonc`](../setup/paseo/config.base.jsonc) with the host overlay ([`windows-pc.jsonc`](../setup/paseo/hosts/windows-pc.jsonc) or [`vps.jsonc`](../setup/paseo/hosts/vps.jsonc)), validates the result against the [pinned schema](../setup/paseo/schema/paseo.config.v1.json), keeps the password hash, relay data and plugin approval, and backs up the old file as `config.json.bak`. Commit and push the change, then run the apply script on each host.

| Area | Setting |
| --- | --- |
| Daemon | `127.0.0.1:6767`, relay on, no proxy in front |
| Profiles | The six roles above. Models and modes are in the base config. Check them after CLI updates in **Settings → Providers**. |
| Worktrees | Paseo default path. Project setup commands go into the project's `paseo.json`. |
| Runtime | The VPS turns off the web UI, dictation and voice mode. |
| MCP | Paseo MCP for orchestration is on. GitHub goes through `gh`, not an MCP server. |

Version updates and the schema refresh are in the [Paseo reference](../setup/paseo/README.md).

## quota-guard

[quota-guard](../setup/paseo/plugins/quota-guard/README.md) runs when Paseo creates an interactive agent:

- **Account per host.** **Settings → Quota guard** or the command `Switch Gemini account` selects Google A or Google B. The choice applies to new Gemini agents on that host. A running session keeps its account. A simple split is account A on one host and account B on the other.
- **Caps.** Defaults are 90 % (5 hours) and 90 % (week) per Google account, and 85 % / 80 % for Claude. They measure the **used** share. A missing window counts as unknown and cannot trigger a cap.
- **Fallback.** If the chosen provider is at its cap, quota-guard starts the agent on the other provider (Gemini to Claude, or the reverse). If both are at the cap, or the fallback is off, it blocks the agent. A fallback keeps the mode but never raises autonomy. Unknown values allow the agent.
- **Alerts.** Cap, fallback and account switch messages go to an ntfy topic (`NTFY_URL`, optional `NTFY_TOKEN`). Normal Paseo notifications (agent done, approval needed) work without it.

To test a cap, set it just below the current use, start a new agent in a throwaway worktree, check the provider and the message, then set it back. A third account needs `node agy-homes.js --account c`, its own sign-in and an entry in the plugin. There is no automatic account switch.

## One source for three agents

`~/.claude` is the only place I edit. [`sync-agents.js`](../setup/scripts/agents/sync-agents.js) turns `CLAUDE.md`, rules, skills, hooks and agents into the formats Codex and agy expect (`~/.codex/`, `~/.gemini/config/`), and the apply scripts run it on every host. Skills with `disable-model-invocation: true` (`ship`, `release`, `grill-with-docs`) are not synced, because the other tools may not honor that field. Hook input and output are normalized, so `bash-guard.js` protects agy and Codex too.

## Daily flow

1. Open the project on the target host and create a worktree from the right base, for example `origin/main`.
2. Start `planner` with the goal, the files and the checks. Send the plan with `/paseo-handoff` to `implementer`, or to `implementer-fast` for one or two files with a clear test.
3. The implementer builds and tests, then answers with `STATUS:`. Run the check again yourself and read the diff.
4. Start `reviewer` for a larger diff, or `reviewer-claude` for security, data or release diffs. Then approve the push and the PR.
5. When the task is done or the context is full, run `/checkpoint` and `/clear`. The next session reads `.claude/checkpoint.md`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Provider not available | Diagnostic report, absolute CLI path, version, sign-in in the right HOME, restart of Paseo Desktop |
| Relay does not connect | Daemon runs, relay is on, outbound traffic is possible. Create a new pairing link. |
| Quota guard missing | Plugin execution is allowed, the plugin path in the config exists on this host, plugin log |
| agy account B shows account A | The browser signed in with its active account. Delete `antigravity-oauth-token` under `~/.agy-homes/b/.gemini/antigravity-cli` and sign in again in a private window. |
| `[pull] skipped` | `~/.claude` is not on `master`. Switch the branch or set `CLAUDE_CONFIG_BRANCH`. |
| `[pull] failed` | `~/.claude` has local commits, so a fast-forward is not possible. Push or drop them. |
| `[paseo] failed: the daemon is still running` | Quit Paseo from the tray icon and run the script in its own terminal. |
| `build-config.js --check failed` | Schema error in the JSONC sources. Read the `Schema check failed` lines. |
| VPS container not healthy after `apply.sh` | `docker logs paseo --tail 50` |
| No Gemini numbers | Check `/usage` in agy first. agy 1.5.18 reported only a weekly window for Gemini models. |

## Sources

- [Paseo docs](https://paseo.sh/docs): [Docker](https://paseo.sh/docs/docker), [configuration](https://paseo.sh/docs/configuration), [Antigravity provider](https://paseo.sh/docs/supported-providers/antigravity), [plugins](https://paseo.sh/docs/plugins), [skills](https://paseo.sh/docs/skills)
- Google: [Antigravity FAQ](https://antigravity.google/docs/faq), [terms](https://antigravity.google/terms), [plans](https://antigravity.google/docs/plans)
- Anthropic: [Claude Code setup](https://code.claude.com/docs/en/setup), [permissions](https://code.claude.com/docs/en/permissions)
