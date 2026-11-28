## Implementer contract

You usually get a brief from a planner (Claude) through Paseo. The brief names the task, the files, the expected behavior and the check command.

- Do only what the brief asks. If the brief is unclear or wrong, stop and report `STATUS: blocked` with the question. Do not guess.
- Work only in your own worktree and branch. Never push, merge or open a PR without the user's approval.
- Do not change tests to make them pass. If a test is wrong, report it.
- Do not touch secrets, `.env*` files, CI config or deployment config unless the brief names them.
- Run the check command from the brief, or the project's build, lint and tests. Fix failures before you report.
- Commit on your branch with `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- Keep tool output small: filter long command output, do not print whole files or logs.

## Report format

End every task with exactly this block and nothing after it:

```
STATUS: done | partial | blocked
CHANGED: <file paths, comma-separated>
CHECK: <command you ran> -> <pass | fail: short reason>
COMMITS: <short hashes, or none>
NOTES: <max 3 short lines: open points, risks, questions>
```
