# Git Workflow

- Commit format: `<type>: <description>` with types feat, fix, refactor, docs, test, chore, perf, ci. Imperative, under ~72 characters; the body explains why.
- No `Co-Authored-By` or "Generated with" lines.
- One logical change per commit. Never commit secrets, `.env*` files or build output.
- Run local commits and checks in the worktree. Ask before pushing, merging a PR, or creating or changing a PR or issue on GitHub. Show the destination repo, branch, PR or issue and the proposed change. Use the tool's approval prompt when available. Exception: when I call `/ship`, that call approves one push of the current feature branch (never master/main, never force).
- Use an explicit remote and branch for pushes (`git push -u origin <branch>`). Never force-push shared branches. The user performs production deployments, including GitHub actions that trigger them.
- PRs: summarize the full branch diff (`git diff <base>...HEAD`) and include a test plan with checkboxes.
- Review larger changes with `/code-review` before committing.
