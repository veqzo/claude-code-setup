#!/usr/bin/env bash
# Applies the config repo to the running Paseo container. Safe to run again.
# Run it on the VPS host as a user with Docker access, not inside the container:
#
#   bash /etc/dokploy/compose/<app>/code/docker/paseo-vps/apply.sh [--yes]
#
# Use the copy from the Dokploy checkout on the host. Agents in the container
# can edit /home/paseo/.claude, so never run a script from that volume on the host.
#
# 1. Fast-forwards ~/.claude in the container (pull only, pushes are disabled).
# 2. Installs the shared Antigravity rules, hooks and skills.
# 3. Creates ~/.agy-homes/b for secondary agy accounts.
# 4. If ~/.paseo/config.json is stale: stops the container, writes the config
#    from a one-off container without network, and starts the container again.
set -euo pipefail

container="${PASEO_CONTAINER:-paseo}"
cfg=/home/paseo/.claude
yes=false

case "${1:-}" in
  "") ;;
  -y | --yes) yes=true ;;
  *)
    echo "Usage: apply.sh [--yes]" >&2
    exit 2
    ;;
esac

if [[ -f /.dockerenv ]] || ! command -v docker >/dev/null 2>&1; then
  echo "Run this on the VPS host with Docker access, not inside a container." >&2
  exit 1
fi
if [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" != "true" ]]; then
  echo "Container $container is not running. Deploy or start it in Dokploy first." >&2
  exit 1
fi

in_container() { docker exec -e GIT_TERMINAL_PROMPT=0 --user paseo "$container" "$@"; }

if ! in_container test -d "$cfg/.git"; then
  echo "No config checkout in the container. Run the first setup:" >&2
  echo "  docker exec -it --user paseo $container paseo-vps-bootstrap <owner>/<repo>" >&2
  exit 1
fi

echo "[pull] $cfg"
in_container git -C "$cfg" pull --ff-only --autostash
echo "[agents] Antigravity rules, hooks and skills"
in_container node "$cfg/scripts/agents/sync-agents.js" --only agy
echo "[agy-homes] separate HOME for agy account B"
in_container node "$cfg/scripts/setup/agy-homes.js"

echo "[paseo] checking the config"
if check="$(in_container node "$cfg/scripts/paseo/build-config.js" --host vps --check 2>&1)"; then
  echo "$check"
  echo "Done. The Paseo config is up to date."
  exit 0
fi
echo "$check"
if [[ "$check" != *"Changed keys"* ]]; then
  echo "build-config.js --check failed. Nothing written." >&2
  exit 1
fi

if [[ "$yes" != true ]]; then
  read -r -p "Restart $container to write the new Paseo config? Running agents stop. [y/N] " answer
  if [[ ! "$answer" =~ ^[yY]$ ]]; then
    echo "Nothing written."
    exit 0
  fi
fi

image="$(docker inspect -f '{{.Config.Image}}' "$container")"
docker stop "$container" >/dev/null
# Start the container again even when the write fails.
trap 'docker start "$container" >/dev/null || echo "Start failed. Run: docker start $container" >&2' EXIT
docker run --rm --network none --user paseo --entrypoint node --volumes-from "$container" "$image" \
  "$cfg/scripts/paseo/build-config.js" --host vps
trap - EXIT
docker start "$container" >/dev/null

echo "[paseo] waiting for the healthcheck"
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
  if [[ "$status" == healthy || "$status" == none ]]; then
    echo "Done. $container is $status."
    exit 0
  fi
  sleep 3
done
echo "$container is not healthy after 90 s. Check: docker logs $container" >&2
exit 1
