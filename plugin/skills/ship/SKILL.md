---
name: ship
description: Commit the current work, run the checks and push the current feature branch. The user calling /ship is the push approval.
disable-model-invocation: true
---

The user called `/ship`. This call is the approval to push the **current feature branch** once. It is not an approval for anything else.

## Hard limits

- Never push `master`, `main`, `release/*` or any branch the user did not name. If the current branch is one of these, stop and ask.
- Never force-push. Never use `--no-verify`. Never merge a PR.
- Never commit secrets, `.env*` files or build output. If the secret scan blocks the commit, stop and report.

## Steps

1. `git branch --show-current` and `git status --short`. If there is nothing to commit and nothing to push, say so and stop.
2. Run the project's checks (`/verify` in pre-commit mode, or the check command from the project's CLAUDE.md). If a check fails, stop and report. Do not push.
3. Stage only the files that belong to this task. Group unrelated changes into separate commits.
4. Commit with `git commit -m "<type>: <description>" -m "<why>"`. Types: feat, fix, refactor, docs, test, chore, perf, ci.
5. Push with an explicit remote and branch: `git push -u origin <branch>`.
6. If the user passed `pr` as an argument, open a PR with `gh pr create --fill` against the default branch. Otherwise do not create a PR.
7. Report in three lines or fewer: commits, branch, push result (and the PR URL).
