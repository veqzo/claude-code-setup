# Install this setup with an agent

This file is a prompt. Give it to a coding agent on your own computer, and the agent sets up this configuration for you, adapted to your stack.

**Claude Code** (recommended, it can install everything):

```
Read https://raw.githubusercontent.com/veqzo/claude-code-setup/main/INSTALL.md and follow it to set up my machine.
```

**Codex** works too. It gets the skills and an `AGENTS.md`, but not the hooks, permissions and plugin, because those exist only in Claude Code.

The agent interviews you first, shows a plan, and changes nothing before you agree. It backs up your current config before it writes.

---

## Instructions for the agent

You are setting up the Claude Code configuration from `https://github.com/veqzo/claude-code-setup` on the user's own computer, and optionally Codex. Adapt it to the user. Do not copy it blindly: it was written for one person's stack (Kotlin, Python, React, MongoDB, Docker on a VPS, OpenBao as secret manager, Paseo with Gemini as a second agent).

### Ground rules

- Talk to the user in the language they write in, unless they ask for another one. Keep this file's steps in order.
- Change nothing until the user has approved the plan in step 5. Steps 1 to 4 only read.
- Never read, print or copy credentials or secrets: `.env` files (except `.env.example`), `~/.claude/.credentials.json`, `~/.claude.json` tokens, SSH keys, `~/.codex/auth.json`, `~/.vault-token`, `~/.paseo/`. Note that they exist, nothing more.
- Do not read conversation history (`~/.claude/projects/*/*.jsonl`, `~/.claude/history.jsonl`). Memory files (`~/.claude/projects/*/memory/*.md`, `~/.claude/CLAUDE.md`) are fine to read.
- The user runs Windows, macOS or Linux. Prefer `node` and `git` commands that work on all three. On Windows, the sync hooks need Git for Windows (Git Bash).
- Put new values into the user's config files, not into this repo's files.
- When you are not sure, ask. Give a recommended answer with each question.

### Step 1: Get the repo

Clone it into a temporary folder (not into `~/.claude`):

```
git clone --depth 1 https://github.com/veqzo/claude-code-setup.git <temp>/claude-code-setup
```

What is in it:

| Path | What it is | Where it goes |
|---|---|---|
| `plugin/` | Plugin `veqzo-setup`: 10 skills, 1 subagent (`security-reviewer`), the `/verify` command, hooks (command guard and secret scan, format on edit) and a band above the prompt (sync status, auto mode blocks) | Installed with `claude plugin install`, not copied |
| `.claude-plugin/marketplace.json` | Marketplace `veqzo` that lists the plugin | Added with `claude plugin marketplace add` |
| `setup/CLAUDE.md` | Global preferences (the author's), including a routing section for Paseo | Template for `~/.claude/CLAUDE.md` |
| `setup/rules/` | 3 always-loaded rules and 8 rules scoped with `paths:` (Python, Kotlin, MongoDB, Docker, frontend, UI design, security, testing) | `~/.claude/rules/` (only the ones that fit) |
| `setup/settings.json` | Permissions (deny, ask, allow), auto mode environment, plugins, model, env | Template for `~/.claude/settings.json` |
| `setup/settings.sync-hooks.json`, `setup/scripts/hooks/`, `setup/scripts/lib/`, `setup/claude-dir.gitignore` | Optional sync of `~/.claude` with the user's own private git repo | `~/.claude/` (only if the user wants sync) |
| `setup/scripts/agents/` | `sync-agents.js`: writes the same rules, skills and hooks into the Codex and agy (Antigravity CLI) config | `~/.claude/scripts/agents/` (only for Codex or agy) |
| `setup/paseo/`, `setup/scripts/paseo/`, `setup/scripts/setup/`, `setup/docker/paseo-vps/` | Optional Paseo multi-agent setup: config sources, the `quota-guard` and GitHub plugins, the config builder, the apply scripts and a VPS container | Only with step 7.6, see `docs/paseo.md` |

Read `README.md`, `docs/reference.md` and, if the user wants Paseo, `docs/paseo.md` in the clone. They explain why each part exists.

### Step 2: Look around (read only)

Collect facts. Do not ask the user for anything you can find yourself.

1. **System:** OS and version, shell, `git --version`, `node --version`, `claude --version`, `codex --version`, `agy --version`, `paseo --version`.
2. **Tools:** check which of these exist: `docker`, `python`/`python3`, `uv`, `pip`, `java`, `gradle`, `kotlin`, `npm`, `pnpm`, `yarn`, `bun`, `go`, `cargo`, `gh`, `ruff`, `ktlint`, `rustfmt`, `prettier`, `bao` (OpenBao), `vault`, `op` (1Password), `doppler`.
3. **Existing Claude Code config** in `~/.claude/`: `CLAUDE.md`, `settings.json`, `rules/`, `agents/`, `commands/`, `skills/`, installed plugins (`claude plugin list`), memory files (`~/.claude/projects/*/memory/*.md`). Is `~/.claude` a git repo (`git -C ~/.claude remote -v`)?
4. **Existing Codex config:** `~/.codex/AGENTS.md`, `~/.codex/config.toml` (no secrets), `~/.agents/skills/`.
5. **Projects:** ask the user for one to five project folders (they can say none). In each, read only manifests and config: `package.json`, lockfiles, `pyproject.toml`, `requirements*.txt`, `build.gradle.kts`, `pom.xml`, `go.mod`, `Cargo.toml`, `Dockerfile`, `compose*.yml`, `.github/workflows/`, `tsconfig.json`, `tailwind.config.*`, `components.json` (shadcn). Do not open `.env` files.
6. **Claude memory:** ask the user to paste their Claude.ai memory if they want (claude.ai → Settings → memory). Use it as a source of preferences. Do not store it anywhere else. If they give none, go on without it.

### Step 3: Show what you found

Give a short summary as a table: OS, languages and frameworks, databases, package managers, infra and deploy, secret manager, GitHub use, other coding agents (Codex, agy, Paseo), existing config and its size. Say what you could not find out.

### Step 4: Interview

Ask in rounds of up to five numbered questions. Give your recommended answer with each one, based on step 2. Skip questions that the facts already answer. Cover:

1. **Stack:** main languages, frameworks, database, frontend stack. Which of the eight scoped rules apply (`python.md`, `kotlin.md`, `mongodb.md`, `docker.md`, `frontend.md`, `ui-design.md`, `security.md`, `testing.md`; recommend `security.md` and `testing.md` for everyone)? Does a stack have no rule yet (Go, PostgreSQL, ...)? Then offer to write a new one in step 7.3.
2. **Infra and secrets:** where they deploy (Dokploy, Vercel, Fly, Kubernetes, nothing), their secret manager (OpenBao, Vault, 1Password, Doppler, `.env` only), sensitive targets (production hosts, databases).
3. **Way of working:** OS(es), IDE, GitHub through `gh` CLI or MCP, answer language and style, how much the agent may do without asking.
4. **Models and cost:** default model (`sonnet` in this setup), subagent models, auto compact. Keep aliases, not pinned model IDs.
5. **Parts to install:**
   - The plugin (recommended: yes).
   - `CLAUDE.md` and rules.
   - Permissions and auto mode.
   - Sync of `~/.claude` between machines with their own **private** repo (optional, see step 7.5).
   - Paseo with a second agent such as Gemini (optional, see step 7.6; recommended: no, unless they already use Paseo or ask for it).
   - Codex (skills and `AGENTS.md`).
6. **Existing config:** if `~/.claude` already has content, ask: **merge** (keep the user's files, add this setup, ask on each conflict; recommended) or **replace** (after the backup).

### Step 5: Plan and approval

Show the plan: every file you will create or change, the plugins and tools you will install, and what you will skip. For a merge, show the conflicts and your proposed resolution. Wait for an explicit yes. If the user changes the plan, show it again.

### Step 6: Back up

Copy these from `~/.claude` (where they exist) to `~/.claude.backup-<YYYYMMDD-HHMM>/`: `CLAUDE.md`, `settings.json`, `rules/`, `agents/`, `commands/`, `skills/`, `scripts/`, `.gitignore`. For Codex: `~/.codex/AGENTS.md` and `~/.agents/skills/` to `~/.codex.backup-<YYYYMMDD-HHMM>/`. Make a backup folder only when there is something to copy. Get the time stamp with `node -e "console.log(new Date().toISOString().slice(0,16).replace(/[-:]/g,'').replace('T','-'))"`. Tell the user the backup path.

### Step 7: Install for Claude Code

1. **Plugin:**
   ```
   claude plugin marketplace add veqzo/claude-code-setup
   claude plugin install veqzo-setup@veqzo
   ```
   Do this **before** step 7.4: the CLI writes `enabledPlugins` and `extraKnownMarketplaces` into `~/.claude/settings.json` itself. Read the file again after the install and merge into that version. Keep the marketplace source the CLI wrote.
   Its skills appear as `veqzo-setup:<name>` (for example `/veqzo-setup:grilling`). If the user already has a skill with the same name in `~/.claude/skills/`, ask which one to keep, so they do not have two. The guard hooks need `node` on the PATH. Plugin hooks load when Claude Code starts, so they are not active in this session yet.

2. **`CLAUDE.md`:** write `~/.claude/CLAUDE.md` from the interview. Use `setup/CLAUDE.md` for its structure and tone: short, one line per preference, stack detail in rules instead. Replace the author's stack, infra and secret manager with the user's. Remove the section "Routing (Claude quota is the bottleneck)" and the line about VPS sessions in the GitHub section unless the user chose Paseo in step 4. Remove the section "Shell on Windows" if the user has no Windows machine. Keep it under about 40 lines. On merge: sort the user's lines and the new lines by topic (stack, infra, secrets, way of working, answers). Where two lines cover the same topic, keep the user's line, and list the pair as a conflict in the plan of step 5 (for example "Answer briefly." and "Use short sentences, one idea per sentence."). Add only lines whose topic is new.

3. **Rules:** copy `coding-style.md`, `git-workflow.md` and the scoped rules that match the stack into `~/.claude/rules/`. Do not copy a rule for a stack the user does not use. Then go through each copied rule:
   - Search it for the author's specifics and replace them with the user's tools, or remove them: `OpenBao`, `Dokploy`, `Traefik`, `Cloudflare`, `Ktor`, `Motor`, `PyMongo`, `Pydantic`, `discord`, `Gradle`, `eclipse-temurin`, `Testcontainers`, `Scrapling`, `chrome-devtools`, `kotlinx`, `Kotlin/JS`.
   - `git-workflow.md` mentions the `/ship` skill. Keep that exception only if the plugin is installed.
   - `docker.md` has a section "Dokploy and Traefik". Rewrite it for the user's deploy target, or remove it.
   - `ui-design.md` has Kotlin paths in its `paths:` list and a Kotlin section. Remove both if the user has no Kotlin web code.
   - `web-research.md` is built around a self-hosted Scrapling MCP server. Copy it only if the user has a similar fetch MCP server, and rename the tools in it.
   - Keep the `paths:` frontmatter, so the rule loads only for matching files.
   - **New stack rule** (for example `go.md`, `postgres.md`): write it in the shape of `python.md` or `kotlin.md`: a `paths:` list for that stack's files, then short sections for structure, error handling, concurrency, data access, tooling (formatter, linter, test runner). Keep it under about 80 lines. Show it to the user.

4. **`settings.json`:** start from `setup/settings.json`, and go through it key by key. Write the merge as one small `node` script that reads both files and writes the result, so it can be shown and run again.
   - `permissions.deny` and `permissions.ask`: keep them. Remove the `PowerShell(...)` entries if the user has no Windows machine. Replace the entries for tools the user does not have with the same rules for their tools: OpenBao (`bao *`, `~/.vault-token`) → their secret manager (`vault`, `op`, `doppler`), `mongosh` → their database shell (`psql`, `mysql`). Remove the `~/.paseo/**` deny and the `mcp__paseo__*` asks only if the user will never use Paseo (they cost nothing).
   - `permissions.allow`: remove entries for tools the user does not have (`gradle`, `uv`, `ruff`, `ktlint`, ...). Add read-only and routine commands of their stack (for Go: `go build`, `go test`, `go vet`, `gofmt -l`). Keep `WebFetch` domains only for docs they use.
   - `autoMode.environment`: rewrite every line except `$defaults` with the user's facts (GitHub account, secret manager, deploy targets, sensitive hosts, trusted services). Drop lines about MCP servers and hosts they do not have (Scrapling, chrome-devtools, Paseo, the VPS).
   - `enabledPlugins`: keep `veqzo-setup@veqzo` and `context7@claude-plugins-official`. Keep only the LSP plugins for their languages (`kotlin-lsp`, `pyright-lsp`, `typescript-lsp`, `rust-analyzer-lsp`). For other languages, look for an LSP plugin in the `claude-plugins-official` marketplace (`/plugin` in Claude Code, or its repo `anthropics/claude-plugins-official`), and offer it if one exists. Ask about `chrome-devtools-mcp` (needs local Chrome and a dev server). Keep `extraKnownMarketplaces`.
   - `env`: keep the telemetry switches and the auto compact values. Never put a secret here.
   - `attribution` is set to empty strings, so Claude adds no `Co-Authored-By` line to commits and PRs. Ask the user what they want.
   - `model`, `modelSettings` (effort per model), `theme`, `autoUpdatesChannel`: ask, or keep.
   - On merge: union the permission lists (a rule in the user's `deny` wins over this setup's `allow`), keep the user's own keys, ask on each conflicting value.
   - Validate the result: `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <path>`.

5. **Sync (optional):** only if the user wants it and has, or creates, a **private** GitHub repo for it.
   - Copy `setup/scripts/hooks/sync.sh`, `push.sh`, `secret-gate.js` to `~/.claude/scripts/hooks/` and `setup/scripts/lib/secret-scan.js` to `~/.claude/scripts/lib/`.
   - Copy `setup/claude-dir.gitignore` to `~/.claude/.gitignore`. It is a whitelist: everything is ignored except the listed config. Remove entries the user does not need (`_archive/`, `mods/`, `.github/`, `paseo/`, `docker/` without Paseo), and add their own folders. Without this file, `push.sh` would push credentials and history.
   - Merge the `hooks` block of `setup/settings.sync-hooks.json` into `~/.claude/settings.json`, and set `env.CLAUDE_CONFIG_REPO` to `<owner>/<repo>` of their private repo. `CLAUDE_CONFIG_BRANCH` overrides the branch `master`.
   - First push: `git -C ~/.claude init -b master`, add the remote, `git add -A`, run `node ~/.claude/scripts/hooks/secret-gate.js` from inside `~/.claude` (it must exit 0), show `git status` to the user, commit, push.
   - On a second machine, the user runs `CLAUDE_CONFIG_REPO=<owner>/<repo> bash ~/.claude/scripts/hooks/sync.sh` once (from Git Bash on Windows).

6. **Paseo (optional):** only if the user chose it in step 4. Ask again before you start, because it installs more tools and signs in more accounts.
   - Tell the user first: running the Antigravity CLI (agy) inside a third-party tool such as Paseo, and switching between Google accounts, can break Google's terms for consumer plans and can get an account banned. Let the user decide. They can also use Paseo with Claude Code only.
   - Follow `docs/paseo.md` for the host they want (Windows PC or VPS). Copy `setup/paseo/`, `setup/scripts/paseo/`, `setup/scripts/setup/` and `setup/scripts/agents/` into `~/.claude` with the same paths.
   - Replace the author's values in `setup/paseo/` (hosts, accounts, caps, ntfy topic) with the user's. Never write a token into these files; `build-config.js` keeps the secrets of the existing `~/.paseo/config.json`.
   - The user signs in to Paseo, Claude Code and agy themselves. Do not handle their tokens.
   - Run `node ~/.claude/scripts/setup/apply.js --host windows-pc --dry-run` first and show the output. Run it without `--dry-run` only after the user agrees, and after they quit Paseo.

### Step 8: Install for Codex (optional)

If `codex` is not installed, ask whether to write the files anyway.

1. **Skills:** copy each folder from `plugin/skills/` to `~/.agents/skills/` (the current user skills folder; `~/.codex/skills/` is the old one). Keep each folder whole, with its `LICENSE`, its scripts and, where there is one, its `agents/openai.yaml` (only some skills have one). Do not copy `ship`, `release` and `grill-with-docs`: they are manual-only in Claude Code, and Codex may not honor that. If a folder with the same name exists, ask before you replace it. Also copy `plugin/skills/THIRD_PARTY_NOTICES.md` next to them.
2. **`AGENTS.md`:** write `~/.codex/AGENTS.md` from the same preferences as `CLAUDE.md`. If one exists, merge the same way as `CLAUDE.md` in step 7.2. Codex has no `paths:`-scoped rules, so add a short section per stack with the most important points from the matching rules. Keep it short. Leave out Claude-only parts (hooks, permissions, plugins, subagent models).
3. Alternative: if the user installed the sync scripts, `node ~/.claude/scripts/agents/sync-agents.js --only codex` does steps 8.1 and 8.2 from `~/.claude`. Run it with the user's approval, and show what it wrote.
4. Hooks, permissions, the plugin and the band do not exist in Codex in the same form. Say so in the report.

### Step 9: Verify

- `claude plugin list` shows `veqzo-setup@veqzo` as enabled.
- Every JSON file you wrote parses.
- The guard works. This prints `2`. The plugin hooks are not active in the session that installed them, so you can run it. If a guard blocks it, ask the user to run it in a normal terminal:
  ```
  node -e "const { spawnSync } = require('child_process'); const command = 'git push --' + 'force'; const r = spawnSync('node', [process.argv[1]], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' }); console.log(r.status)" <plugin-folder>/scripts/hooks/bash-guard.js
  ```
  `<plugin-folder>` is the `installPath` of `veqzo-setup@veqzo` in `~/.claude/plugins/installed_plugins.json`.
- `claude plugin details veqzo-setup@veqzo` lists 10 skills plus `verify`, 1 agent and 2 hook events.
- Every rule you wrote has valid frontmatter (`paths:` is a YAML list of quoted globs), and `CLAUDE.md` is under about 40 lines.
- Tell the user to restart Claude Code, then check `/skills`, `/agents`, `/verify` and `/hooks`. Rules with `paths:` load only when Claude reads a matching file.
- If sync is on: `git -C ~/.claude status` shows no credentials, history or `projects/` as tracked or staged.
- If Paseo is on: `paseo --version` works, and the profiles from `docs/paseo.md` show up in Paseo.

### Step 10: Report

Tell the user:

- What you installed and changed, file by file.
- What you skipped, and why.
- The backup path, and how to roll back: restore the backup folder, then `claude plugin uninstall veqzo-setup@veqzo`.
- How to update: `claude plugin marketplace update veqzo` and `claude plugin update veqzo-setup@veqzo`, or `/plugin` in Claude Code. `CLAUDE.md`, rules and settings are now theirs and do not update.
- That the skills belong to their authors (see `plugin/skills/THIRD_PARTY_NOTICES.md`), and that this setup is not affiliated with Anthropic, Google or Paseo.

Delete the temporary clone from step 1 at the end, but only if you made it.
