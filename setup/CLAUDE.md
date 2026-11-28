## Stack and preferences

- Main stacks: Kotlin (Ktor, Gradle Kotlin DSL, MongoDB coroutine driver), Python (FastAPI, Motor/PyMongo, discord.py, async-first), React + Tailwind + shadcn/ui, sometimes Rust. Databases: MongoDB by default, propose another one only when it fits the project better.
- Infra: Docker + Compose, self-hosted via Dokploy on a VPS (Traefik, Cloudflare DNS). Dokploy adds the Traefik labels when a domain is configured, so do not add basic Traefik labels to compose files.
- Secrets: OpenBao is the secret manager. Configuration goes through `.env` variables with minimal hardcoding. Never read, print or commit real `.env*` files; `.env.example` is fine.
- Machines: Windows 11 (main), macOS, and a Linux Paseo container on the VPS. Prefer cross-platform commands and Node scripts over shell-specific ones.
- IDEs: IntelliJ and PyCharm. Do not add editor-specific config files unless asked.
- Detect the toolchain from the project (`pyproject.toml`, `build.gradle.kts`, `package.json`, `Cargo.toml`, lockfiles) instead of assuming one.
- Stack detail lives in path-scoped rules (`~/.claude/rules/`) and loads only when matching files are touched.

## GitHub

- Use the `gh` CLI for all GitHub operations, no MCP.
- Keep outputs small: always filter with `--json` and `--jq`, e.g.
  gh pr list --json number,title,state --jq '.[] | "\(.number): \(.title)"'
- For endpoints without a dedicated command: use `gh api <endpoint>`.
- Follow `rules/git-workflow.md` for GitHub write approvals. Project branches and PRs can be published from a VPS session after the user approves.

## Working style

- For non-trivial changes, plan first. Run the project's build, lint and tests before you report a task as done.

<!-- claude-only -->
- Work in the main session by default. Use plan mode for non-trivial changes and run `/verify` before you claim done.
- Subagents (Agent tool): only `Explore` with `model: haiku` for a broad search, or `security-reviewer` with `model: opus` for auth, secrets or exposed infra. Do not use `general-purpose` or other agent types unless I ask.

### Routing (Claude quota is the bottleneck)

- Target split of implementation work: Gemini about 65 %, Claude about 35 %.
- Claude plans, debugs hard problems and reviews. When Paseo tools are available, a multi-file implementation with a clear plan goes to Gemini:
  - `implementer` (Gemini Hydrogen): normal tasks. `implementer-fast` (Gemini Flash): one or two files with a clear test.
  - Write the brief with task, files, contract, check command and limits. Gemini answers with a `STATUS:` block. Re-run the check yourself and review the diff before you merge.
  - `implementer-claude` only when both Google accounts are over their caps.
- Do it yourself when the change is small, when explaining it costs more than doing it, or when it needs judgment during the work.
- Reviews: `reviewer` (Gemini, read-only) for a larger diff before commit. `reviewer-claude` (Sonnet, read-only) for security, data or release diffs.
- Follow the `/paseo` skill. After you launch a Paseo agent, wait for its finish notification. Do not poll its status in a loop.
- Every Paseo agent that edits files works in its own worktree. After your review, you may merge its branch into the current local branch.

### Sessions

- One task per session. When a task is done, or the context is full of old work, run `/checkpoint` and tell me to `/clear`.
- At the start of a session, read `.claude/checkpoint.md` if it exists.
- When the session limit is near, run `/checkpoint` so that another agent can continue.
<!-- /claude-only -->

## Shell on Windows

- Git Bash has no usable `/tmp` for native tools. Write temp files inside the repo (for example `.git/tmp/`) or under `$TEMP`, never `/tmp/...`.
- Commit messages: use `git commit -m "<subject>" -m "<body>"`. Do not use `git commit -F -` or `-F /tmp/...`; on Windows they produce an empty message.
- Multi-line file content: use the file write tool, not a heredoc inside a long command.
- Never `sleep N; tail` to wait. Run the command in the background and wait for its notification.

## Answers

- Write answers in the style of Simplified Technical English (ASD-STE100), also when answering in German: short sentences, one idea per sentence, active voice, one term per concept, no idioms.
- Lead with the result, then the reason. Use lists or tables for steps and comparisons.
- Messages written in my name (Discord, PR or issue comments, email): short, plain, no AI tone.
