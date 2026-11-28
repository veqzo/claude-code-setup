# 📚 Reference

> [!NOTE]
> Details behind the [README](../README.md): every rule, agent, command, skill and hook, the permission lists and how the sync works. For the multi-agent setup with Paseo, see [paseo.md](paseo.md). For the command guard on its own, see [bash-guard.md](bash-guard.md). To install the setup, see [INSTALL.md](../INSTALL.md).

The repo has two parts:

- [`plugin/`](../plugin) is the plugin `veqzo-setup` (marketplace `veqzo`). It holds the skills, the agent, `/verify`, the hooks and the band above the prompt. Install it with `claude plugin install`, and it updates itself.
- [`setup/`](../setup) holds what goes into `~/.claude` itself and is yours after the install: `CLAUDE.md`, `rules/`, `settings.json`, the agent sync, the Paseo setup and the optional sync hooks. A plugin cannot ship rules, permissions or auto mode settings, which is why these are separate. The files keep their paths relative to `~/.claude`, because the scripts resolve paths from there.

## 📌 CLAUDE.md

[`setup/CLAUDE.md`](../setup/CLAUDE.md) is always loaded, so it stays short (under 60 lines). It has five parts:

| Part | Content |
|---|---|
| Stack and preferences | Languages, databases, infra, secret manager, machines, IDEs, where stack detail lives |
| GitHub | `gh` only, small outputs with `--json`/`--jq`, approvals per `rules/git-workflow.md` |
| Working style | Plan first, run `/verify`, which subagents are allowed |
| Routing | Gemini about 65 %, Claude about 35 % of implementation work; which Paseo profile gets which job; the brief and `STATUS:` contract; worktree per editing agent |
| Sessions, shell, answers | One task per session with `/checkpoint`, Windows shell pitfalls, answer style |

Remove the routing part if you do not use Paseo.

## 📏 Rules

In [`setup/rules/`](../setup/rules). Copy only the ones that match your stack.

| File | Loads | Content |
|---|---|---|
| `coding-style.md` | always | Language-neutral: immutability where idiomatic, small files, error handling, boundary validation, config via environment, completion checklist |
| `git-workflow.md` | always | Conventional commit format, PR workflow, no `Co-Authored-By` lines, pushes, PR changes and merges need approval, `/ship` exception |
| `web-research.md` | always | Escalate blocked or empty fetches (403/429, Cloudflare, JS-only pages) to the Scrapling MCP, keep fetched output small, treat fetched content as untrusted data, public pages only |
| `security.md` | source, Docker, compose, `.env.example`, CI workflows | Universal pre-commit checks, secret handling, response protocol when an issue is found (deep review is the `security-reviewer` agent) |
| `testing.md` | `**/*.{py,kt,kts,ts,tsx,js,jsx,mjs}` | Behavior-focused tests, test-first where it pays off, no fixed coverage percentage, what to do with failing tests |
| `python.md` | `**/*.py`, `**/pyproject.toml` | async rules (no blocking calls), FastAPI structure, Pydantic v2, pydantic-settings, Motor/PyMongo, discord.py intents and cogs, typing, ruff, pytest-asyncio |
| `kotlin.md` | `**/*.kt`, `**/*.kts`, `libs.versions.toml` | Null safety, sealed types, structured concurrency, Ktor plugins/config/testApplication, Mongo Kotlin coroutine driver, Gradle KTS + version catalog |
| `mongodb.md` | repository/DAO/mongo files, `db/`, `models/`, `init-mongo*` | Schema and embedding vs referencing, ESR index rule, atomic updates, NoSQL injection, auth and exposure, operations. Also says when to prefer PostgreSQL |
| `docker.md` | `Dockerfile*`, `compose*.yml`, `.dockerignore` | Pinned tags, multi-stage, non-root, no secrets in layers, no published DB ports, healthchecks, Dokploy/Traefik notes |
| `frontend.md` | `*.ts`, `*.tsx`, `*.jsx`, `tailwind.config.*`, `components.json` | Strict TypeScript, React patterns, Tailwind (v3/v4), shadcn/ui conventions, design tokens, Vitest/Playwright, client-exposed env vars |
| `ui-design.md` | `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `*.html`, Kotlin/JS and Ktor web/template paths | Anti-slop rules: read `DESIGN.md`/`PRODUCT.md` first, tokens only, a ban list of AI tells, kotlinx.html and Kotlin/JS styling, `impeccable` for critique (never its per-edit hook), screenshots at 1440 and 390 px before calling anything polished |

Dokploy adds the basic Traefik labels itself when a domain is configured in its Domains tab, so the rules tell Claude **not** to add them to compose files.

## 🤖 Agents

In [`plugin/agents/`](../plugin/agents). With the plugin installed it shows up as `veqzo-setup:security-reviewer`.

| Agent | Model | Tools | Use for |
|---|---|---|---|
| `security-reviewer` | sonnet (spawn with `model: opus` for auth, secrets or exposed infra) | Read, Grep, Glob, Bash (no Write/Edit) | App checks plus an **infrastructure checklist**: Dockerfile, Compose, Traefik/Dokploy, MongoDB auth and exposure, OpenBao, Discord bot. Reports findings, never edits |

The code reviewer, test-first guide and cleanup agents are gone. The built-in `/code-review`, plan mode and the Paseo profiles cover their jobs, and every agent description costs context in every session. `CLAUDE.md` also limits subagents: `Explore` with Haiku for a broad search, `security-reviewer` with Opus, nothing else unless asked.

**Model strategy:** Sonnet is the default for the main session. Opus plans (plan mode or the Paseo `planner`) and runs the security review. Haiku does pure file search. Gemini implements and does the first review through Paseo. In `settings.json`, aliases are used instead of pinned model IDs, so the setup does not go stale. The Paseo profiles name exact models, because Paseo needs them; check them after CLI updates.

## ⌨️ Commands

| Command | Model-invocable | Purpose |
|---|---|---|
| `/verify [quick\|full\|pre-commit\|pre-pr]` | yes | Build, types, lint, tests, secrets and git checks for the detected stack |

Toolchain detection (`pyproject.toml`/`uv.lock`, `build.gradle.kts`, `package.json` + lockfile, compose files) replaces any hardcoded package manager.

## 🧰 Skills

The plugin ships 10 skills in [`plugin/skills/`](../plugin/skills). Each skill folder keeps its license, and [`THIRD_PARTY_NOTICES.md`](../plugin/skills/THIRD_PARTY_NOTICES.md) lists the source path, commit and license of each upstream skill.

| Skills | Source | License |
|---|---|---|
| `domain-modeling`, `research`, `grilling`, `writing-for-agents`, `grill-with-docs` (manual only) | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `impeccable` 4.8.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 |
| `apple-design` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT |
| `checkpoint`, `ship` (manual only), `release` (manual only) | my own | MIT |

My own three:

- `checkpoint` writes the task state to `.claude/checkpoint.md` (goal, done, next steps, open questions), so a fresh session or another agent can continue. `CLAUDE.md` tells every session to read it at the start.
- `ship` is a manual approval: calling it approves one push of the current feature branch. Never `main`/`master`, never a force push.
- `release` bumps the version, writes the changelog and tags, and asks before each push.

Manual-only skills have `disable-model-invocation: true`, so their descriptions cost no context, and `sync-agents.js` does not pass them to Codex or agy. The Paseo skills (`/paseo`, `/paseo-handoff`, `/paseo-advisor`, `/paseo-committee`) come with Paseo itself and are not part of this plugin.

`impeccable` runs its engine through the skill's own launcher. Its optional per-edit hook (`impeccable hooks on`) stays off; `rules/ui-design.md` says so explicitly.

## 🪝 Hooks

The guard and format hooks come with the plugin ([`plugin/hooks/hooks.json`](../plugin/hooks/hooks.json), scripts in [`plugin/scripts/`](../plugin/scripts)). The two sync hooks are optional and go into `settings.json` ([`setup/settings.sync-hooks.json`](../setup/settings.sync-hooks.json)). **`disableAllHooks` in `settings.json` is the master switch**: while it is `true`, nothing below runs.

| Event | Matcher | Script | What it does |
|---|---|---|---|
| SessionStart | `startup\|resume` | `sync.sh` | Pulls the config repo (`git pull --ff-only --autostash`), only on `master` |
| SessionEnd | all | `push.sh` | Only on `master`: runs `secret-gate.js`, then commits changes and pushes to `origin/master` |
| PreToolUse | `Bash\|PowerShell` | `bash-guard.js` | 1) blocks dangerous commands and shell reads of real `.env` files, 2) scans changes for secrets before `git commit` |
| PostToolUse | `Edit\|Write` | `format-on-edit.js` | Formats the edited file with the project's own formatter |

The rtk rewrite hook is gone, and the notification sound is no longer registered (`notify.js` is still in the plugin folder). Paseo sends its own notifications when an agent finishes or needs an approval.

### `bash-guard.js`

Exit code `2` blocks the call and sends stderr to the agent. Any internal error exits `0`, so the guard can never lock a session.

**Blocks** (a second line of defense behind the deny rules, which only match the usual spelling):

- force pushes: `--force`, `--force-with-lease`, `-f`, `+refspec`
- recursive deletes of root-like paths: `/`, `~`, `$HOME`, `.`, `..`, drive roots (`rm -rf` and `Remove-Item -Recurse`)
- downloads piped into a shell: `curl ... | sh`, `irm ... | iex`
- `docker system prune -a/--volumes`, `docker volume rm/prune`
- MongoDB `dropDatabase`
- shell reads of real `.env` files: `cat`, `head`, `grep`, `sed`, `type`, `Get-Content`, `cp` and others. `.env.example`, `.env.sample`, `.env.template` and commands that only name the file (`git check-ignore .env`) stay allowed

The rules live in `plugin/scripts/lib/danger-patterns.js` and have tests: `node --test plugin/scripts/lib/*.test.js`.

**Secret scan before `git commit`:** scans the staged diff, or, for `git add ... && git commit` and `commit -a`, the working tree plus untracked files. It detects AWS keys, GitHub tokens, Anthropic/OpenAI-style keys, Slack and Google keys, Discord bot tokens, OpenBao tokens, legacy Phase service tokens, private key blocks, connection strings with credentials, hardcoded `password/token/api_key = "..."` assignments, and committed `.env`, `*.pem`, `*.key`, SSH key files (`.env.example` is allowed). Reports show file, line and pattern name, **never the value**. An intentional test fixture can carry the comment `secret-scan:allow`.

**Other agents:** `hook-io.js` normalizes the hook input and output, so `sync-agents.js` can register the same guard for agy and Codex.

### `format-on-edit.js`

Runs only when the project clearly uses the tool, never uses the network (no `npx`), never goes through a shell:

| Files | Formatter | Condition |
|---|---|---|
| `.py` | `ruff format` | `ruff.toml`/`.ruff.toml` or `[tool.ruff` in `pyproject.toml`, and `ruff` on PATH |
| `.ts .tsx .js .jsx .mjs .cjs .css` | local `prettier` | `node_modules/prettier` exists |
| `.kt .kts` | `ktlint -F` | build file mentions ktlint, and `ktlint` is an executable on PATH |
| `.rs` | `rustfmt` | `Cargo.toml` in the project, and `rustfmt` on PATH |

### Sync hooks

`sync.sh` and `push.sh` are what keep the machines in step. They log to `sync-hook.log` and always exit `0`.

- `sync.sh`: if `~/.claude/.git` is missing, clones the repo (SSH, then HTTPS) and checks it out; otherwise `fetch` and `pull --ff-only --autostash` on `master`. On any other branch it does nothing, so a review branch is never rebased or fast-forwarded under you.
- `push.sh`: exits at once on any branch other than `master`, while another git process holds `index.lock`, and in cloud sessions. Otherwise `git add -A` (bounded by the `.gitignore` whitelist), then `secret-gate.js`, commit `auto-sync from <host> (<date>)`, push; on failure `pull --rebase --autostash` and one retry.
- `secret-gate.js`: scans the staged diff with the same scanner as `bash-guard.js`. On a finding, or on any internal error, it exits `1`; `push.sh` then unstages everything and skips that sync, and `sync-hook.log` records file, line and pattern (never the value). Unlike `bash-guard.js` it fails closed, because the auto-sync commit would otherwise bypass the scan.

**Using these scripts yourself:** they carry no repository name. `sync.sh` reads it from `CLAUDE_CONFIG_REPO` (`owner/name`) in the `env` block of `settings.json`, and needs it only for the first clone on a new machine; later runs use the `origin` of `~/.claude`. `CLAUDE_CONFIG_BRANCH` changes the branch (default `master`). Use a **private** repo, and keep the whitelist `.gitignore` ([`setup/claude-dir.gitignore`](../setup/claude-dir.gitignore)) and the secret gate in place. [INSTALL.md](../INSTALL.md) step 7.5 sets it up.

### The band above the prompt

The plugin also has a mod (`plugin/hooks/register.tsx`). It draws one line above the prompt: the sync state of `~/.claude` (behind, not pushed, local changes, the last hook failure), and the auto mode classifier blocks of the session with a **Clear** button. It also adds `/config-sync` and `/auto-denials`. Without a git repo in `~/.claude`, it shows only the blocks.

## 🔄 Agent sync and apply scripts

| Script | What it does |
|---|---|
| [`setup/scripts/agents/sync-agents.js`](../setup/scripts/agents/sync-agents.js) | Writes `CLAUDE.md`, rules, skills, hooks and agents from `~/.claude` into the Codex (`~/.codex/`) and agy (`~/.gemini/config/`) formats. `--only agy` or `--only codex` limits it. Manual-only skills are excluded. `agy-extra.md` and `codex-extra.md` add tool-specific instructions, for agy the implementer contract and the `STATUS:` format. |
| [`setup/scripts/setup/apply.js`](../setup/scripts/setup/apply.js) | One run per PC: pull `~/.claude`, run the agent sync, create the agy account homes, rebuild the Paseo config when it is stale (`--host windows-pc`). `--dry-run` shows a preview. It waits until you quit Paseo before it writes. Without `--host` it skips the Paseo step. |
| [`setup/scripts/setup/agy-homes.js`](../setup/scripts/setup/agy-homes.js) | Creates `~/.agy-homes/<id>` for another Google account and links the shared agy config into it |
| [`setup/scripts/paseo/build-config.js`](../setup/scripts/paseo/build-config.js) | Merges the JSONC sources, validates them against the pinned schema, keeps local secrets of the existing file, writes `~/.paseo/config.json` |
| [`setup/docker/paseo-vps/apply.sh`](../setup/docker/paseo-vps/apply.sh) | The same for the VPS: runs on the VPS host, pulls in the container, asks before it restarts the container |

The details are in [paseo.md](paseo.md).

## 🔐 Permissions

Evaluation order is **deny, then ask, then allow**; an `allow` cannot override a `deny` or an `ask`. Rules exist in pairs for the `Bash` and `PowerShell` tools (same pattern shape). Counts: 147 allow, 104 deny, 88 ask. `permissions.defaultMode` is `auto`, so the auto mode classifier decides everything that no rule covers.

**Deny (blocked):**
- Reading or editing secrets: `.env`, `.env.local/.dev/.production/...`, `secrets/**`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `.git-credentials`, `~/.ssh`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.gnupg`, gcloud and `gh` configs, `~/.vault-token`, `~/.docker/config.json`, `~/.npmrc`, `~/.pypirc`, `~/.netrc`, `~/.claude/.credentials.json`, `~/.paseo/**`
- Shell reads of env files (`cat`, `head`, `tail`, `less`, `more`, `bat`, `Get-Content ... .env*`)
- Force pushes, `git clean -fdx`, root-like `rm -rf`, `mkfs`, `dd`, `chmod -R 777`
- Pipe-to-shell (including bare `sh`/`bash`/`zsh` and `Invoke-Expression`)
- `docker volume rm/prune`, `docker system prune -a/--volumes`, `dropDatabase` and `.drop()`, `gh repo delete`, `gh api ... DELETE`

**Ask (confirmation):**
- git: `push` (also `git -C <dir> push`), `checkout --`, `checkout .`, `stash drop/clear`
- GitHub writes: PR create/edit/ready/review/comment/merge/close, issue create/edit/comment/close, releases, `gh api` with POST/PUT/PATCH or with fields (`-f`, `-F`, `--input`), because fields make `gh api` send a POST
- MongoDB shells and tools: `mongosh`, `mongo`, `mongorestore`, `mongoimport`
- OpenBao CLI: `bao *`
- Remote: `ssh`, `scp`, `rsync`, `sudo`
- Edits to the shared config itself: `~/.claude/settings.json`, `CLAUDE.md`, `scripts/`, `skills/`, `agents/`, `commands/`, `rules/`, `hooks/`
- Paseo MCP tools that act outside the agent: `create_terminal`, `send_terminal_keys`, `respond_to_permission`, `create_schedule`, `create_heartbeat`

**Allow (no prompt):** `git status/diff/log/show/add/commit/switch/stash`, `pytest`, `ruff`, `mypy` (also via `uv run` / `python -m`), `./gradlew test|build|check|compile|assemble|tasks|dependencies|ktlint|detekt` (and `.\gradlew` in PowerShell), `npm|pnpm test/lint/build/typecheck`, `npx tsc|vitest|eslint`, read-only `docker`/`docker compose` commands, read-only `gh` commands and `gh api`, `WebSearch`, `.env.example`, and `WebFetch` for documentation domains (GitHub, Python, Node.js, Kotlin, Ktor, FastAPI, Pydantic, discord.py, MongoDB, Docker, Dokploy, OpenBao, React, Tailwind, shadcn, PyPI, Claude Code docs, Paseo).

Broad allows such as `python *`, `node *`, `npx *` and `gh:*` are deliberately absent, because each of them permits arbitrary code. Package installs, Docker writes, `curl` and deletes are not in any list: the auto mode classifier judges them in context, with the `autoMode.environment` description.

**Honest limit:** Bash/PowerShell deny rules match the command text. They are not a security boundary (a different spelling or `sh -c` can bypass them), which is why `bash-guard.js` exists as a second layer. A `Read` deny also blocks `Edit`/`Write` on the same path, but does not stop a subprocess from reading a file. For hard isolation use the OS sandbox, or a container like the Paseo VPS host.

## 🔌 Plugins and MCP

Enabled in `enabledPlugins`, all from `anthropics/claude-plugins-official` except this plugin:

| Plugin | Why |
|---|---|
| `kotlin-lsp`, `pyright-lsp`, `typescript-lsp`, `rust-analyzer-lsp` | Language servers for the stacks; they cost no context |
| `context7` | Current library docs instead of answers from memory |
| `chrome-devtools-mcp` | Screenshots and debugging of local dev servers, used by `rules/ui-design.md` |
| `veqzo-setup` | This plugin |

Budget goal: fewer than 10 active MCP servers and fewer than 80 tools. Other MCP sources: `scrapling` (user scope, a Scrapling MCP server you host yourself; fallback for blocked pages, triggered by `rules/web-research.md`) and the Paseo MCP server inside Paseo sessions. GitHub goes through `gh`, not an MCP server. Tool search keeps MCP schemas deferred. `disableClaudeAiConnectors` is `true`, so the claude.ai connectors do not load.

## 🎛️ Models and settings

| Setting | Value | Reason |
|---|---|---|
| `model` | `sonnet` | Cheap default for daily work |
| `modelSettings` | Opus `high`, Haiku `low` effort | Opus is for plans and reviews, Haiku for search |
| `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `80` | Compact before the window gets crowded |
| `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `200k` | Compaction is measured against 200k tokens, even on models with a larger window |
| `env.IMPECCABLE_*` | `1` | Telemetry and update checks off for impeccable |
| `permissions.defaultMode` | `auto` | A classifier handles routine actions; the deny and ask rules still apply |
| `autoMode.environment` | `$defaults` + context | Tells the classifier which GitHub account, secret manager, deploy target and MCP servers are trusted, and which remote targets are sensitive |
| `attribution` | `commit: ""`, `pr: ""` | No `Co-Authored-By` or "Generated with" lines |
| `autoUpdatesChannel` | `stable` | No preview builds on the daily setup |
| `disableAllHooks` | `false` | Master switch. Set it to `true` to turn every hook off at once |

## 🔄 Sync across machines

On my machines `~/.claude` is itself a private git repo (branch `master`), and the public repo is built from it by a weekly export that scans for secrets and private values first. Its `.gitignore` is a **whitelist**: everything is ignored (`*`), and only config is re-included. The same file is [`setup/claude-dir.gitignore`](../setup/claude-dir.gitignore).

Never synced (stay local): `.credentials.json`, `history.jsonl`, `projects/`, `sessions/`, `plugins/`, `cache/`, `backups/`, `file-history/`, `paste-cache/`, `shell-snapshots/`, `security/`, logs, and `contexts/`.

A new top-level directory is **ignored by default**. If a new file does not show up in `git status`, add it to the whitelist (the `!dir/` and `!dir/**` pair, parent first). Check with `git check-ignore -v <path>`.

The VPS host pulls the same repo with a read-only token and never pushes. Do not add keys with secrets to the `env` block of `settings.json`, because that file is synced.

## 💻 Setting up a new machine

The easy way: give [INSTALL.md](../INSTALL.md) to Claude Code. By hand:

1. Install Git, Node.js and Claude Code. On Windows, install Git for Windows (Git Bash) so `bash` resolves to it and not the WSL stub.
2. Install the plugin: `claude plugin marketplace add veqzo/claude-code-setup`, then `claude plugin install veqzo-setup@veqzo`.
3. Copy `setup/CLAUDE.md`, the rules you want and `setup/settings.json` into `~/.claude`, and replace my stack, accounts and hosts with yours (`autoMode.environment` above all).
4. Install the tools the hooks use if you want formatting: `ruff`, `ktlint`, `rustfmt`, and `prettier` inside each frontend project.
5. Optional sync: see [INSTALL.md](../INSTALL.md) step 7.5.
6. Optional Paseo: see [paseo.md](paseo.md).
7. Register the Scrapling MCP if you host one. User-scope servers live in `~/.claude.json`, which is not synced. Pass any token through an environment variable or your secret manager, never inline in a committed file:
   ```
   claude mcp add --scope user --transport http scrapling https://<your-scrapling-host>/mcp
   claude mcp list    # scrapling must show as connected
   ```

## 🛠️ Maintaining the setup

- **New stack-specific rule:** create `rules/<name>.md` with a `paths:` list in the frontmatter. Always quote globs and use a YAML list. Without `paths:` a rule is always loaded; keep those few and short.
- **New skill:** `skills/<name>/SKILL.md` with name and description, plus a `LICENSE` file. Run `sync-agents.js` so agy and Codex get it too.
- **New agent:** `agents/<name>.md` with `name` (equal to the filename), a one-sentence `description` (this is always loaded, keep it precise), `tools`, and `model` as an alias.
- **New permission:** add it to the right list in `settings.json`; remember `deny` and `ask` beat `allow`. Prefer specific patterns over `tool *`.
- **New hook:** write a Node script in `scripts/hooks/` (in the plugin: `plugin/scripts/hooks/`, registered in `plugin/hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`), read the JSON from stdin through `hook-io.js`, exit `2` to block, never throw. Test it with a sample payload before registering it.
- **Paseo config change:** edit the JSONC sources in `paseo/`, never `~/.paseo/config.json`, then run the apply script on each host.
- **Check what the next sync would commit:** `git -C ~/.claude add -n -A`.
- **Compare sizes** of the always-loaded part after changes; keep `CLAUDE.md` well below 200 lines.

## ✅ Verification

- `settings.json` is valid JSON; no rule appears in more than one of allow/deny/ask.
- The plugin lib tests pass: `node --test plugin/scripts/lib/*.test.js`.
- The weekly export runs the private test suite (export, agent sync, apply and config builder tests) and fails closed on any secret, private domain, hoster name or local user path.
- `sync.sh` skips without `CLAUDE_CONFIG_REPO`, clones with it, and later pulls through `origin`.
- Used daily on the Windows desktop, the MacBook and the VPS container.

## ⚠️ Known limits and unverified assumptions

- **SessionEnd budget:** SessionEnd hooks reportedly get only a short time budget. If pushes silently do not happen, `push.sh` may be cut off. `push.sh` also runs on every `/clear`.
- Shell deny rules are best effort, see the Permissions section above.
- `ktlint` on Windows is often a `.bat` file; `format-on-edit.js` calls executables without a shell and will skip it silently in that case.
- `rules/web-research.md` assumes the MCP server is registered under the name `scrapling` (tool prefix `mcp__scrapling__`).
- The Paseo setup was built for Paseo 0.17.5 and agy 1.5.18. Newer versions can change the config schema or the CLI flags.
- Running agy inside Paseo can violate Google's Antigravity terms for consumer plans. See [paseo.md](paseo.md#accounts-and-cost).

## ⏪ Rollback

- A single file: `git -C ~/.claude checkout HEAD -- <path>` restores the last committed version (uncommitted changes to that file are lost).
- Disable all automation immediately: set `"disableAllHooks": true` in `settings.json`.
- Disable a single plugin: set its entry in `enabledPlugins` to `false`.
- Remove the plugin: `claude plugin uninstall veqzo-setup@veqzo`.
- Undo an install made with [INSTALL.md](../INSTALL.md): restore the `~/.claude.backup-<date>` folder it made.
- Paseo config: `build-config.js` keeps the previous file as `~/.paseo/config.json.bak`.
