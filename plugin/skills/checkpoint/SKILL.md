---
name: checkpoint
description: Save the task state to .claude/checkpoint.md so a fresh session or another agent can continue. Use before /clear, near a usage limit, or when the user asks for a checkpoint, handoff note or prompt for a new chat.
---

Write the current task state to `.claude/checkpoint.md` in the repo root. A new session or another agent (Claude, Gemini) reads it and continues without the old context.

## Steps

1. Make sure the file stays local. If `.git/info/exclude` does not contain `.claude/checkpoint.md`, append that line. Never add it to a tracked `.gitignore`.
2. Collect facts with small commands: `git branch --show-current`, `git status --short`, `git log --oneline -5`.
3. Overwrite `.claude/checkpoint.md` with the template below. Keep it under 60 lines. Write facts, not a story.
4. Never write secrets, tokens, `.env` values or raw logs into the file.
5. Tell the user in one or two lines that the checkpoint is saved and that they can run `/clear` now.

## Template

```markdown
# Checkpoint <YYYY-MM-DD HH:MM>

## Goal
<one or two sentences: what the user wants and why>

## Decisions
- <decision the user made or approved, with the reason>

## Done
- <finished step> (<commit hash or file>)

## State
- Branch: <name>, <clean | N files changed>
- Checks: <command> -> <pass | fail: short reason>

## Next
1. <next concrete step, with file paths>

## Open questions
- <question for the user, or "none">

## Do not
- <things the user rejected or forbade in this task>
```

## Resume

When a session starts and `.claude/checkpoint.md` exists, read it first. Check that the branch and the last commit still match. Continue with "Next". When the task is finished, delete the file.
