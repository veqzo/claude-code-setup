---
name: release
description: Prepare a release: bump the version, update the changelog, tag, and clean up merged branches. Asks before every push.
disable-model-invocation: true
---

Prepare a release for the current repo. The argument is the new version (`0.2.3`) or a bump level (`patch`, `minor`, `major`). If there is no argument, propose a bump level from the commits and ask.

## Steps

1. Preconditions. Stop and report if one fails:
   - The working tree is clean.
   - The current branch is the default branch (`master` or `main`) and is up to date with `origin`.
   - The checks pass (`/verify`, or the check command from the project's CLAUDE.md).
2. Find the last tag (`git describe --tags --abbrev=0`) and list the commits since then (`git log --oneline <tag>..HEAD`).
3. Bump the version in the project's version file. Detect it: `Cargo.toml`, `package.json`, `pyproject.toml`, `build.gradle.kts` or `gradle.properties`. Update the lockfile with the project's tool if the version is in it (`cargo update -p <crate>`, `npm install --package-lock-only`, `uv lock`).
4. Update `CHANGELOG.md` if it exists. Group the commits by type (Added, Fixed, Changed). Skip chore, ci and test commits.
5. Commit `chore: release v<version>` and create an annotated tag `v<version>`.
6. Show the commit, the tag and the changelog section. **Ask** before you push. After approval: `git push origin <default-branch>` and `git push origin v<version>`.
7. Branch cleanup: list local branches merged into the default branch (`git branch --merged`). **Ask** before you delete them. Delete remote branches only if the user names them.
8. Report: version, tag, push result, deleted branches.

Never force-push, never move an existing tag, never publish to a package registry unless the user asks.
