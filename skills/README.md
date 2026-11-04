# Skills

This repo does not ship skill files. The skills I run day to day are third-party work, and I only redistribute what I wrote myself. Install the ones you want from their upstream projects, and keep their licenses.

## What I use

| Skill | Upstream | License |
|---|---|---|
| `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `prototype`, `research`, `grilling`, `writing-for-agents` | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `review-changes` (upstream name `code-review`, renamed so it does not clash with the built-in `/code-review`) | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `grill-me`, `grill-with-docs`, `handoff`, `implement`, `to-spec`, `to-tickets`, `setup-matt-pocock-skills` (manual only, `disable-model-invocation: true`, so their descriptions cost no context) | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `impeccable` 4.8.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 (see its `LICENSE.txt`) |
| `apple-design` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT |

The upstreams were matched by skill name against each repository, and licenses are as reported by GitHub or by the skill's own license file. I did not diff every file, so a skill I run may differ from its upstream version.

## How I keep them cheap

- Every model-invocable skill puts its description into the context of each session, so I keep the list short and make rarely used ones manual (`disable-model-invocation: true`).
- Plugin skills I never trigger by description are set to `"name-only"` under `skillOverrides` in `settings.json`.
- `impeccable` runs its engine through the skill's own launcher. Its optional per-edit hook (`impeccable hooks on`) stays off; `rules/ui-design.md` says so explicitly.
