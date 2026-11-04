#!/usr/bin/env bash
# SessionStart hook: syncs ~/.claude with github.com/veqzo/claude-config
# Design goals: never block a session, never prompt for credentials,
# stay silent unless something actually changed.

set -u
export GIT_TERMINAL_PROMPT=0

DIR="$HOME/.claude"
SSH_URL="git@github.com:veqzo/claude-config.git"
HTTPS_URL="https://github.com/veqzo/claude-config.git"
BRANCH="master"
LOG="$DIR/sync-hook.log"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG" 2>/dev/null || true; }

command -v git >/dev/null 2>&1 || exit 0
mkdir -p "$DIR" 2>/dev/null || true

# --- First run on this machine: adopt the repo into the existing ~/.claude ---
if [ ! -d "$DIR/.git" ]; then
  tmp="$(mktemp -d 2>/dev/null)" || exit 0
  if git clone --quiet "$SSH_URL" "$tmp/repo" 2>>"$LOG" || \
     git clone --quiet "$HTTPS_URL" "$tmp/repo" 2>>"$LOG"; then
    if mv "$tmp/repo/.git" "$DIR/.git" 2>>"$LOG"; then
      # Overwrite tracked files (settings.json, skills/, ...) with the repo
      # version; untracked local state (projects/, todos/, history) stays.
      git -C "$DIR" checkout --quiet -- . 2>>"$LOG" || true
      log "initial sync complete"
      echo "claude-config: initial sync from origin/$BRANCH complete"
    fi
  else
    log "initial clone failed (auth? network?)"
  fi
  rm -rf "$tmp" 2>/dev/null || true
  exit 0
fi

# --- Every later start: fast-forward to origin ---
# Only the sync branch follows origin; a review/feature branch is left alone.
current="$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "$current" != "$BRANCH" ]; then
  log "sync skipped: on branch $current, not $BRANCH"
  exit 0
fi

# Cloud sessions only: fall back to the read-only CLAUDE_CONFIG_TOKEN when the
# GitHub proxy does not serve this repo. Local clients never take this branch.
before="$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -n "${CLAUDE_CONFIG_TOKEN:-}" ] && \
   ! git -C "$DIR" fetch --quiet origin "$BRANCH" 2>>"$LOG"; then
  header="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$CLAUDE_CONFIG_TOKEN" | base64 -w0)"
  git -C "$DIR" -c "http.https://github.com/.extraheader=$header" fetch --quiet origin "$BRANCH" 2>>"$LOG" || { log "fetch failed (token)"; exit 0; }
  git -C "$DIR" merge --ff-only --autostash --quiet "origin/$BRANCH" 2>>"$LOG" || { log "merge failed (diverged?)"; exit 0; }
else
  git -C "$DIR" fetch --quiet origin "$BRANCH" 2>>"$LOG" || { log "fetch failed (offline?)"; exit 0; }
  git -C "$DIR" pull --ff-only --autostash --quiet 2>>"$LOG" || { log "pull failed (diverged?)"; exit 0; }
fi
after="$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"

[ "$before" != "$after" ] && echo "claude-config synced: $before -> $after"
exit 0
