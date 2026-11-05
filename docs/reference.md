# 📚 Reference

> [!NOTE]
> Details behind the [README](../README.md): every rule, agent, command, skill and hook, the permission lists and how the sync works. For the command guard on its own, see [bash-guard.md](bash-guard.md). To install the setup, see [INSTALL.md](../INSTALL.md).

The repo has two parts:

- [`plugin/`](../plugin) is the plugin `veqzo-setup` (marketplace `veqzo`). It holds the skills, agents, `/verify`, the hooks and the band above the prompt. Install it with `claude plugin install`, and it updates itself.
- [`setup/`](../setup) holds what goes into `~/.claude` itself and is yours after the install: `CLAUDE.md`, `rules/`, `settings.json` and the optional sync hooks. A plugin cannot ship rules, permissions or auto mode settings, which is why these are separate.

## 📏 Rules

In [`setup/rules/`](../setup/rules). Copy only the ones that match your stack.

| File | Loads | Content |
|---|---|---|
| `coding-style.md` | always | Language-neutral: immutability where idiomatic, small files/functions, error handling, boundary validation, config via environment, completion checklist |
| `git-workflow.md` | always | Conventional commit format, PR workflow, no `Co-Authored-By` lines, pushes and merges need confirmation |
| `web-research.md` | always | Escalate blocked or empty fetches (403/429, Cloudflare, JS-only pages) to the Scrapling MCP, keep fetched output small, treat fetched content as untrusted data, public pages only |
| `security.md` | source, Docker, compose, `.env.example`, CI workflows | Universal pre-commit checks, secret handling, response protocol when an issue is found (deep review is the `security-reviewer` agent) |
| `testing.md` | `**/*.{py,kt,kts,ts,tsx,js,jsx,mjs}` | Behavior-focused tests, test-first where it pays off, no fixed coverage percentage, what to do with failing tests |
| `python.md` | `**/*.py`, `**/pyproject.toml` | async rules (no blocking calls), FastAPI structure, Pydantic v2, pydantic-settings, Motor/PyMongo, discord.py intents and cogs, typing, ruff, pytest-asyncio |
| `kotlin.md` | `**/*.kt`, `**/*.kts`, `libs.versions.toml` | Null safety, sealed types, structured concurrency, Ktor plugins/config/testApplication, Mongo Kotlin coroutine driver, Gradle KTS + version catalog |
| `mongodb.md` | repository/DAO/mongo files, `db/`, `models/`, `init-mongo*` | Schema and embedding vs referencing, ESR index rule, atomic updates, NoSQL injection, auth and exposure, operations. Also says when to prefer PostgreSQL |
| `docker.md` | `Dockerfile*`, `compose*.yml`, `.dockerignore` | Pinned tags, multi-stage, non-root, no secrets in layers, no published DB ports, healthchecks, Dokploy/Traefik notes |
| `frontend.md` | `*.ts`, `*.tsx`, `*.jsx`, `tailwind.config.*`, `components.json` | Strict TypeScript, React patterns, Tailwind (v3/v4), shadcn/ui conventions, design tokens, Vitest/Playwright, client-exposed env vars |
| `ui-design.md` | `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `*.html`, Kotlin/JS and Ktor web/template paths | Anti-slop rules: read `DESIGN.md`/`PRODUCT.md` first, tokens only, a ban list of AI tells, kotlinx.html and Kotlin/JS styling, `impeccable` for critique (never its per-edit hook), screenshots at 1440 and 390 px before calling anything polished |

`security.md` and `testing.md` used to load in every session; scoping them to source files keeps them out of sessions that only touch docs or config. Dokploy adds the basic Traefik labels itself when a domain is configured in its Domains tab, so the rules tell Claude **not** to add them to compose files.

## 🤖 Agents

In [`plugin/agents/`](../plugin/agents). With the plugin installed they show up as `veqzo-setup:<name>`.

| Agent | Model | Tools | Use for |
|---|---|---|---|
| `code-reviewer` | sonnet | read + Bash | Review after larger changes: Python, Kotlin, Docker and frontend checks, severity levels |
| `security-reviewer` | sonnet | read + Bash (no Write/Edit) | App checks plus an **infrastructure checklist**: Dockerfile, Compose, Traefik/Dokploy, MongoDB auth/exposure, Phase secrets, Discord bot. Reports findings, never edits |
| `tdd-guide` | sonnet | read/write + Bash | Failing test first, minimal implementation, refactor, where a test is worthwhile |
| `refactor-cleaner` | sonnet | read/write + Bash | Dead-code cleanup with per-stack tools (vulture, detekt, knip), tests around each batch |

Planning, architecture, build fixes, E2E and docs no longer have their own agents. Plan mode and the main session cover them, and every agent description costs context in every session.

Model strategy: Sonnet for the main session and all subagents, Haiku for pure file search or listing. Only aliases (`sonnet`, `opus`, `haiku`) are used, never pinned model IDs, so the setup does not go stale.

**Sonnet works, Opus judges:** for security-critical changes (auth, secrets, exposed infrastructure) spawn the reviewer with an override: `security-reviewer` with `model: opus`. For whole sessions, `/model opusplan` uses Opus in plan mode and Sonnet for execution.

## ⌨️ Commands

| Command | Model-invocable | Purpose |
|---|---|---|
| `/verify [quick\|full\|pre-commit\|pre-pr]` | yes | Build, types, lint, tests, secrets and git checks for the detected stack |

The other ten commands (`/plan`, `/build-fix`, `/e2e`, `/checkpoint`, `/orchestrate` and so on) were dropped: plan mode, skills and the built-in `/code-review` cover them. Toolchain detection (`pyproject.toml`/`uv.lock`, `build.gradle.kts`, `package.json` + lockfile, compose files) replaces any hardcoded package manager.

## 🧰 Skills

The plugin ships the 19 skills I use, in [`plugin/skills/`](../plugin/skills). They are other people's work. Each skill folder keeps its upstream license, and [`THIRD_PARTY_NOTICES.md`](../plugin/skills/THIRD_PARTY_NOTICES.md) lists the source path, commit and license of each one.

| Skills | Upstream | License |
|---|---|---|
| `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `prototype`, `research`, `grilling`, `writing-for-agents`, `review-changes` | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `grill-me`, `grill-with-docs`, `handoff`, `implement`, `to-spec`, `to-tickets`, `setup-matt-pocock-skills` (manual only) | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `impeccable` 4.8.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `apple-design` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT |

`review-changes` is upstream's `code-review`, renamed so it does not clash with the built-in `/code-review`. Manual-only skills have `disable-model-invocation: true`, so their descriptions cost no context. Their `agents/openai.yaml` files carry the same setting for Codex (`allow_implicit_invocation: false`).

How I keep them cheap:

- Every model-invocable skill puts its description into each session. The whole plugin adds about 1.9k tokens per session (`claude plugin details veqzo-setup@veqzo`).
- Plugin skills I never trigger by description are set to `"name-only"` under `skillOverrides` in `settings.json`.
- `impeccable` runs its engine through the skill's own launcher. Its optional per-edit hook (`impeccable hooks on`) stays off; `rules/ui-design.md` says so explicitly.

## 🪝 Hooks

The guard, rtk, format and notify hooks come with the plugin ([`plugin/hooks/hooks.json`](../plugin/hooks/hooks.json), scripts in [`plugin/scripts/`](../plugin/scripts)). The two sync hooks are optional and go into `settings.json` ([`setup/settings.sync-hooks.json`](../setup/settings.sync-hooks.json)). **`disableAllHooks` in `settings.json` is the master switch**: while it is `true`, nothing below runs.

| Event | Matcher | Script | What it does |
|---|---|---|---|
| SessionStart | `startup\|resume` | `sync.sh` | Pulls the config repo (`git pull --ff-only --autostash`), only on `master` |
| SessionEnd | all | `push.sh` | Only on `master`: runs `secret-gate.js`, then commits changes and pushes to `origin/master` |
| PreToolUse | `Bash\|PowerShell` | `bash-guard.js` | 1) blocks dangerous commands and shell reads of real `.env` files, 2) scans changes for secrets before `git commit` |
| PreToolUse | `Bash` | `rtk-rewrite.js` | Lets [rtk](https://github.com/rtk-ai/rtk) rewrite the command for compact output; skips commands that match an `ask` rule |
| PostToolUse | `Edit\|Write` | `format-on-edit.js` | Formats the edited file with the project's own formatter |
| Notification | `permission_prompt\|idle_prompt\|elicitation_dialog` | `notify.js` | Plays a sound (`afplay` on macOS, `Media.SoundPlayer` on Windows) |

### `bash-guard.js`

Exit code `2` blocks the call and sends stderr to Claude. Any internal error exits `0`, so the guard can never lock a session.

**Blocks** (a second line of defense behind the deny rules, which only match the usual spelling):

- force pushes: `--force`, `--force-with-lease`, `-f`, `+refspec`
- recursive deletes of root-like paths: `/`, `~`, `$HOME`, `.`, `..`, drive roots (`rm -rf` and `Remove-Item -Recurse`)
- downloads piped into a shell: `curl ... | sh`, `irm ... | iex`
- `docker system prune -a/--volumes`, `docker volume rm/prune`
- MongoDB `dropDatabase`
- shell reads of real `.env` files: `cat`, `head`, `grep`, `sed`, `type`, `Get-Content`, `cp` and others, also wrapped as `rtk read .env` or `rtk grep KEY .env`. `.env.example`, `.env.sample`, `.env.template` and commands that only name the file (`git check-ignore .env`) stay allowed

The rules live in `plugin/scripts/lib/danger-patterns.js` and have tests: `node --test plugin/scripts/lib/danger-patterns.test.js`.

**Secret scan before `git commit`:** scans the staged diff, or, for `git add ... && git commit` and `commit -a`, the working tree plus untracked files. It detects AWS keys, GitHub tokens, Anthropic/OpenAI-style keys, Slack and Google keys, Discord bot tokens, Phase service tokens, private key blocks, connection strings with credentials, hardcoded `password/token/api_key = "..."` assignments, and committed `.env`, `*.pem`, `*.key`, SSH key files (`.env.example` is allowed). Reports show file, line and pattern name, **never the value**. An intentional test fixture can carry the comment `secret-scan:allow`.

### `format-on-edit.js`

Runs only when the project clearly uses the tool, never uses the network (no `npx`), never goes through a shell:

| Files | Formatter | Condition |
|---|---|---|
| `.py` | `ruff format` | `ruff.toml`/`.ruff.toml` or `[tool.ruff` in `pyproject.toml`, and `ruff` on PATH |
| `.ts .tsx .js .jsx .mjs .cjs .css` | local `prettier` | `node_modules/prettier` exists |
| `.kt .kts` | `ktlint -F` | build file mentions ktlint, and `ktlint` is an executable on PATH |

### `rtk-rewrite.js`

A thin wrapper around `rtk hook claude`. rtk rewrites commands such as `git status` or `cargo test` to their `rtk` form, which prints a much shorter result and saves context. The wrapper adds two things:

- **Ask rules keep their prompt.** If the command matches a `Bash(...)` ask rule in the user or project settings, it is passed through unchanged. Otherwise `git stash drop` would become `rtk git stash drop`, no longer match `Bash(git stash drop*)`, and run without confirmation.
- **Fail open, quietly.** Missing rtk, a timeout (8 s) or any error exits `0` and the command runs as written. Telemetry is switched off through the environment.

rtk itself leaves denied commands alone and only returns `allow` for commands that were already allowed. Every git, docker, curl and wget deny rule is mirrored with an `rtk ` prefix anyway, and `rtk read`/`rtk grep` on `.env*` files is denied. The config in `setup/scripts/rtk/config.toml` turns telemetry off and excludes `gh`, whose `--json`/`--jq` output is already small.

### Sync hooks

`sync.sh` and `push.sh` are what keep the machines in step. They log to `sync-hook.log` and always exit `0`.

- `sync.sh`: if `~/.claude/.git` is missing, clones the repo (SSH, then HTTPS) and checks it out; otherwise `fetch` and `pull --ff-only --autostash` on `master`. On any other branch it does nothing, so a review branch is never rebased or fast-forwarded under you.
- `push.sh`: exits at once on any branch other than `master`, while another git process holds `index.lock`, and in cloud sessions. Otherwise `git add -A` (bounded by the `.gitignore` whitelist), then `secret-gate.js`, commit `auto-sync from <host> (<date>)`, push; on failure `pull --rebase --autostash` and one retry.
- `secret-gate.js`: scans the staged diff with the same scanner as `bash-guard.js`. On a finding, or on any internal error, it exits `1`; `push.sh` then unstages everything and skips that sync, and `sync-hook.log` records file, line and pattern (never the value). Unlike `bash-guard.js` it fails closed, because the auto-sync commit would otherwise bypass the scan.

`push.sh` commits without a review step, which is why the whitelist and the secret scan matter.

**Using these scripts yourself:** they carry no repository name. `sync.sh` reads it from `CLAUDE_CONFIG_REPO` (`owner/name`) in the `env` block of `settings.json`, and needs it only for the first clone on a new machine; later runs use the `origin` of `~/.claude`. `CLAUDE_CONFIG_BRANCH` changes the branch (default `master`). Use a **private** repo, and keep the whitelist `.gitignore` ([`setup/claude-dir.gitignore`](../setup/claude-dir.gitignore)) and the secret gate in place: `push.sh` commits and pushes everything the `.gitignore` allows. [INSTALL.md](../INSTALL.md) step 7.6 sets it up.

### The band above the prompt

The plugin also has a mod (`plugin/hooks/register.tsx`). It draws one line above the prompt: the sync state of `~/.claude` (behind, not pushed, local changes, the last hook failure), and the auto mode classifier blocks of the session with a **Clear** button. It also adds `/config-sync` and `/auto-denials`. Without a git repo in `~/.claude`, it shows only the blocks.

## 🔐 Permissions

Evaluation order is **deny, then ask, then allow**; an `allow` cannot override a `deny` or an `ask`. Rules exist in pairs for the `Bash` and `PowerShell` tools (same pattern shape). Counts: 142 allow, 122 deny, 49 ask.

**Deny (blocked):**
- Reading or editing secrets: `.env`, `.env.local/.dev/.production/...`, `secrets/**`, `*.pem`, `*.key`, `*.p12`, `id_rsa*`, `~/.ssh`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.gnupg`, gcloud and `gh` configs, `~/.phase`, `~/.docker/config.json`, `~/.npmrc`, `~/.netrc`, `~/.claude/.credentials.json`
- Shell reads of env files (`cat`, `type`, `Get-Content ... .env*`, `rtk read`, `rtk grep`)
- The same destructive git, docker, curl and wget patterns with an `rtk ` prefix
- Force pushes, `git clean -fdx`, root-like `rm -rf`, `mkfs`, `dd`, `chmod -R 777`
- Pipe-to-shell (including bare `sh`/`bash`/`zsh` and `Invoke-Expression`)
- `docker volume rm/prune`, `docker system prune -a/--volumes`, `dropDatabase`, `gh repo delete`, `gh api ... DELETE`

**Ask (confirmation):**
- git: `push`, `reset --hard`, `clean`, `branch -D`, `rebase`, `restore`, `checkout --`
- package installs: npm/pnpm/yarn, `pip`, `uv add`
- Docker: `compose up/down/exec/run`, `run`, `exec`, `rm`, `stop`, `kill`, `volume *`, `system prune`
- MongoDB tools: `mongosh`, `mongodump`, `mongorestore`, import/export
- GitHub writes: PR create/merge/close/edit, issues, releases, `gh api` POST/PUT/PATCH
- Phase CLI: `phase secrets`, `phase run`, `phase console`
- Network and remote: `curl`, `wget`, `ssh`, `scp`, `rsync`, `sudo`, `Invoke-WebRequest`
- Other deletes: `rm -r/-rf`, `Remove-Item`

**Allow (no prompt):** `git status/diff/log/show/add/commit/switch/stash`, `pytest`, `ruff`, `mypy` (also via `uv run` / `python -m`), `./gradlew test|build|check|compile|assemble|tasks|dependencies|ktlint|detekt` (and `.\gradlew` in PowerShell), `npm|pnpm test/lint/build/typecheck`, `npx tsc|vitest|eslint`, read-only `docker`/`docker compose` commands, read-only `gh` commands and `gh api`, `WebSearch`, and `WebFetch` for documentation domains (GitHub, Python, Kotlin, Ktor, FastAPI, Pydantic, discord.py, MongoDB, Docker, Dokploy, Phase, React, Tailwind, shadcn, PyPI, Claude Code docs).

Broad allows such as `python *`, `node *`, `npx *` and `gh:*` are deliberately absent, because each of them permits arbitrary code.

**Honest limit:** Bash/PowerShell deny rules match the command text. They are not a security boundary (a different spelling or `sh -c` can bypass them), which is why `bash-guard.js` exists as a second layer. A `Read` deny also blocks `Edit`/`Write` on the same path, but does not stop a subprocess from reading a file. For hard isolation use the OS sandbox.

## 🔌 Plugins and MCP

Enabled in `enabledPlugins`, all from `anthropics/claude-plugins-official`:

| Plugin | Why |
|---|---|
| `kotlin-lsp`, `pyright-lsp`, `typescript-lsp` | Language servers for the three stacks; they cost no context |
| `context7` | Current library docs instead of answers from memory |
| `chrome-devtools-mcp` | Screenshots and debugging of local dev servers, used by `rules/ui-design.md` |
| `session-report` | Usage report for a session |

Plugin skills I never trigger by description are set to `"name-only"` under `skillOverrides`, so only their names reach the context. Third-party marketplaces from the old setup (several agent and design collections) were removed: they duplicated the agents in this repo and loaded many descriptions into every session.

Budget goal: fewer than 10 active MCP servers and fewer than 80 tools. Other MCP sources: `scrapling` (user scope, a Scrapling MCP server you host yourself; fallback for blocked pages, triggered by `rules/web-research.md`) and the claude.ai connectors. Tool search keeps MCP schemas deferred.

## 🎛️ Models and settings

| Setting | Value | Reason |
|---|---|---|
| `model` | `sonnet` | Cheap default for daily work |
| `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `75` | Compact before the window gets crowded |
| `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `200k` | Compaction is measured against 200k tokens, even on models with a larger window |
| `env.MDB_MCP_READ_ONLY` | `true` | The MongoDB MCP can read, never write |
| `env.RTK_*`, `env.IMPECCABLE_*` | `1` | Telemetry and update checks off for rtk and impeccable |
| `skillOverrides` | `name-only` | Rarely used plugin skills show only their name |
| `permissions.defaultMode` | `auto` | A classifier handles routine actions; the deny and ask rules still apply |
| `autoMode.environment` | `$defaults` + context | Tells the classifier which GitHub account, secret manager, deploy target and MCP servers are trusted, and which remote targets are sensitive |
| `attribution` | `commit: ""`, `pr: ""` | No `Co-Authored-By` or "Generated with" lines (the schema wants strings, not booleans) |
| `statusLine` | `npx -y ccstatusline@2.2.30` | Version pinned instead of `@latest` (supply-chain risk) |
| `disableAllHooks` | `false` | Master switch. Set it to `true` to turn every hook off at once |

No model ID is pinned, so the `opus` alias always resolves to the current Opus.

## 🔄 Sync across machines

On my machines `~/.claude` is itself a private git repo (branch `master`), and the public repo is built from it by a weekly export that scans for secrets and private values first. Its `.gitignore` is a **whitelist**: everything is ignored (`*`), and only config is re-included. The same file is [`setup/claude-dir.gitignore`](../setup/claude-dir.gitignore).

Never synced (stay local): `.credentials.json`, `history.jsonl`, `projects/`, `sessions/`, `plugins/`, `cache/`, `backups/`, `file-history/`, `paste-cache/`, `shell-snapshots/`, `security/`, logs, and `contexts/`.

A new top-level directory is **ignored by default**. If a new file does not show up in `git status`, add it to the whitelist (the `!dir/` and `!dir/**` pair, parent first). Check with `git check-ignore -v <path>`.

Do not add keys with secrets to the `env` block of `settings.json`, because that file is synced.

## 💻 Setting up a new machine

The easy way: give [INSTALL.md](../INSTALL.md) to Claude Code. By hand:

1. Install Git, Node.js and Claude Code. On Windows, install Git for Windows (Git Bash) so `bash` resolves to it and not the WSL stub.
2. Install the plugin: `claude plugin marketplace add veqzo/claude-code-setup`, then `claude plugin install veqzo-setup@veqzo`.
3. Copy `setup/CLAUDE.md`, the rules you want and `setup/settings.json` into `~/.claude`, and replace my stack, accounts and hosts with yours (`autoMode.environment` above all).
4. Install the tools the hooks use if you want formatting: `ruff`, `ktlint`, and `prettier` inside each frontend project.
   Optional: install [rtk](https://github.com/rtk-ai/rtk) (`winget install rtk-ai.rtk` or `brew install rtk`) and copy `setup/scripts/rtk/config.toml` to rtk's config directory (`%APPDATA%\rtk\` on Windows, `~/Library/Application Support/rtk/` on macOS). Do not run `rtk init -g`: it edits `settings.json` and `CLAUDE.md` on its own. Restart the terminal so the new PATH is picked up.
5. Optional sync: see [INSTALL.md](../INSTALL.md) step 7.6.
6. Register the Scrapling MCP if you host one. User-scope servers live in `~/.claude.json`, which is not synced. Pass any token through an environment variable or your secret manager, never inline in a committed file:
   ```
   claude mcp add --scope user --transport http scrapling https://<your-scrapling-host>/mcp
   claude mcp list    # scrapling must show as connected
   ```

## 🛠️ Maintaining the setup

- **New stack-specific rule:** create `rules/<name>.md` with a `paths:` list in the frontmatter. Always quote globs and use a YAML list. Without `paths:` a rule is always loaded; keep those few and short.
- **New agent:** `agents/<name>.md` with `name` (equal to the filename), a one-sentence `description` (this is always loaded, keep it precise), `tools`, and `model` as an alias.
- **New command:** `commands/<name>.md` with `description`, and `disable-model-invocation: true` if it should only run when typed.
- **New permission:** add it to the right list in `settings.json`; remember `deny` and `ask` beat `allow`. Prefer specific patterns over `tool *`.
- **New hook:** write a Node script in `scripts/hooks/` (in the plugin: `plugin/scripts/hooks/`, registered in `plugin/hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`), read the JSON from stdin, exit `2` to block, never throw. Test it with a sample payload before registering it.
- **Check what the next sync would commit:** `git -C ~/.claude add -n -A`.
- **Compare sizes** of the always-loaded part after changes; keep `CLAUDE.md` well below 200 lines.

## ✅ Verification

Checked when the setup was built:

- `settings.json` is valid JSON; no rule appears in more than one of allow/deny/ask.
- Frontmatter of all agents, commands and rules parses; agent models are valid aliases; every referenced script and agent exists.
- 36 dry-run cases of the hook scripts in a throwaway repository, including empty and malformed stdin (all pass), plus the real command string from `settings.json` under Git Bash.
- Secrets, history and logs are confirmed ignored by `git check-ignore`.
- The plugin passes `claude plugin validate` and installs from the marketplace into an empty home; `claude plugin details` lists 19 skills plus `/verify`, 4 agents and 3 hook events. `bash-guard.js` blocks a force push from the plugin folder.
- `sync.sh` skips without `CLAUDE_CONFIG_REPO`, clones with it, and later pulls through `origin`.
- Tested on both machines, the Windows desktop and the MacBook: the hooks, the sync between them and the `notify.js` sound all work on macOS as well.

## ⚠️ Known limits and unverified assumptions

- **SessionEnd budget:** the docs reportedly give SessionEnd hooks only a short shared time budget (about 1.5 s). If pushes silently do not happen, `push.sh` may be cut off. Unconfirmed. `push.sh` also runs on every `/clear`.
- Shell deny rules are best effort, see the Permissions section above.
- The Phase CLI syntax in the `ask` rules and the Phase token format in the secret scan are best guesses.
- `ktlint` on Windows is often a `.bat` file; `format-on-edit.js` calls executables without a shell and will skip it silently in that case.
- The skill description budget and the full `statusLine` schema were not verified against the docs.
- `rules/web-research.md` assumes the MCP server is registered under the name `scrapling` (tool prefix `mcp__scrapling__`). The path, transport and auth of a self-hosted server depend on how you run it and were not verified here.

## ⏪ Rollback

- A single file: `git -C ~/.claude checkout HEAD -- <path>` restores the last committed version (uncommitted changes to that file are lost).
- Disable all automation immediately: set `"disableAllHooks": true` in `settings.json`.
- Disable a single plugin: set its entry in `enabledPlugins` to `false`.
- Remove the plugin: `claude plugin uninstall veqzo-setup@veqzo`.
- Undo an install made with [INSTALL.md](../INSTALL.md): restore the `~/.claude.backup-<date>` folder it made.

