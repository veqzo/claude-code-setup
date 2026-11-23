# Git Workflow

- Commit format: `<type>: <description>` with types feat, fix, refactor, docs, test, chore, perf, ci. Imperative, under ~72 characters; the body explains why.
- No `Co-Authored-By` or "Generated with" lines.
- One logical change per commit. Never commit secrets, `.env*` files or build output.
- Never force-push shared branches. Pushes and merges need confirmation.
- PRs: summarize the full branch diff (`git diff <base>...HEAD`) and include a test plan with checkboxes.
- Review larger changes with `/code-review` before committing.
