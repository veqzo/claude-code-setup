#!/usr/bin/env bash
# One-time setup inside the Paseo VPS container. Safe to run again.
#
#   docker exec -it --user paseo paseo paseo-vps-bootstrap <owner/repo> [branch]
#
# 1. Connects git to gh and uses a separate read-only token for the config repo.
# 2. Checks out this config repo as ~/.claude and blocks pushes from it.
# 3. Installs shared Antigravity rules and previews the Paseo config build.
set -euo pipefail

usage() {
  echo "Usage: paseo-vps-bootstrap <owner/repo> [branch]" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
repo="$1"
branch="${2:-${CLAUDE_CONFIG_BRANCH:-master}}"
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || usage
[[ "$branch" =~ ^[A-Za-z0-9_./-]+$ && "$branch" != -* ]] || usage

if [[ "$(id -un)" != "paseo" ]]; then
  echo "Run as the paseo user: docker exec -it --user paseo paseo paseo-vps-bootstrap ..." >&2
  exit 1
fi

dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
origin="https://github.com/$repo.git"

if ! gh auth status >/dev/null 2>&1; then
  echo "gh has no valid sign-in. Set GH_TOKEN in the Dokploy environment, then redeploy." >&2
  exit 1
fi
gh auth setup-git

if [[ -z "${CLAUDE_CONFIG_READ_TOKEN:-}" ]]; then
  echo "Set CLAUDE_CONFIG_READ_TOKEN in the Dokploy environment, then redeploy." >&2
  exit 1
fi
if [[ -d "$dir/.git" ]]; then
  [[ "$(git -C "$dir" remote get-url origin)" == "$origin" ]] || {
    echo "Existing config checkout has a different origin." >&2
    exit 1
  }
  [[ "$(git -C "$dir" branch --show-current)" == "$branch" ]] || {
    echo "Existing config checkout is not on the requested branch: $branch" >&2
    exit 1
  }
else
  mkdir -p "$dir"
  git -C "$dir" init -q -b "$branch"
  git -C "$dir" remote add origin "$origin"
fi

# Clear inherited credential helpers for this origin. Resolve the token from
# the container environment at fetch time, including on later session starts.
git -C "$dir" config --local --replace-all "credential.$origin.helper" ""
git -C "$dir" config --local --add "credential.$origin.helper" \
  '!f() { GH_TOKEN="$CLAUDE_CONFIG_READ_TOKEN" gh auth git-credential "$@"; }; f'
git -C "$dir" remote set-url --push origin DISABLED
export GIT_TERMINAL_PROMPT=0

if git -C "$dir" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Updating $dir"
  git -C "$dir" pull --ff-only
else
  # ~/.claude can hold sign-in files already. The repo's .gitignore ignores all
  # but its whitelist, so these files stay untracked. -f replaces untracked
  # files only where the repo has a file with the same path.
  echo "Checking out $repo ($branch) into $dir"
  git -C "$dir" fetch -q origin "$branch"
  git -C "$dir" checkout -q -f -B "$branch" --track "origin/$branch"
fi

echo "Antigravity configuration preview:"
node "$dir/scripts/agents/sync-agents.js" --only agy --dry-run
node "$dir/scripts/agents/sync-agents.js" --only agy

echo
echo "Paseo config preview (no file is written):"
node "$dir/scripts/paseo/build-config.js" --host vps --dry-run

cat <<'EOF'

Next steps (see docker/paseo-vps/README.md):
  1. Write the Paseo config while the daemon is stopped.
  2. Sign in to Claude Code and to each Google account for agy.
  3. Pair your devices with: paseo daemon pair
EOF
