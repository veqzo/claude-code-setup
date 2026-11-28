# Paseo VPS container (host #2)

The official Paseo image plus Claude Code, agy, gh, Temurin JDK 21, uv, jq, ripgrep and build-essential. Dokploy deploys it as a compose service. Clients reach it only through the end-to-end encrypted Paseo relay.

| File | Content |
| --- | --- |
| `Dockerfile` | Child image of Paseo 0.17.5 with base image digests and agent CLI versions pinned |
| `compose.yaml` | Service `paseo`: no ports, loopback listener, dropped capabilities, named volumes |
| `.env.example` | Variables for the Dokploy environment tab (source: OpenBao) |
| `bootstrap.sh` | `paseo-vps-bootstrap` in the image: gh for git, `~/.claude` checkout, config preview |
| `apply.sh` | Runs on the VPS host: pulls the config, syncs agy, rewrites the Paseo config when it is stale |

## Security model

- No published port, no domain, no Traefik labels. `PASEO_LISTEN=127.0.0.1:6767` and `PASEO_WEB_UI_ENABLED=false` are fixed in `compose.yaml`, so the environment tab cannot change them.
- The container is the isolation boundary. Agents share the daemon user. Treat agents as trusted with both volumes, the local Paseo API and every environment variable.
- Give `GH_TOKEN` access to project repos only. Use `CLAUDE_CONFIG_READ_TOKEN` for read access to this repo. Protect the default branch of each repo, including `master` here.
- Claude Code can push a project branch or write to its PR or issue after the user approves the action in the session. Give the project token the corresponding permissions. The user performs actions that trigger a production deployment.
- Keep Docker sockets, host SSH credentials and Dokploy tokens outside the container. Disable deploy triggers for branches agents can write to. Apply production deployments through Dokploy yourself.
- The config checkout uses the read token for pulls. The `DISABLED` push URL and pull-only hook mode prevent accidental pushes. GitHub token permissions enforce the write restriction.

## First deployment

1. Dokploy: create a compose service from this Git repo. Compose path: `docker/paseo-vps/compose.yaml`. Add no domain.
2. Environment tab: set the variables from `.env.example`. Take the values from OpenBao.
3. Deploy. The healthcheck turns healthy after about 30 s.
4. On the VPS shell, run the bootstrap with the repo of this config:
   ```
   docker exec -it --user paseo paseo paseo-vps-bootstrap <owner>/<repo>
   ```
   The bootstrap uses `CLAUDE_CONFIG_BRANCH` and installs the shared Antigravity rules, hooks and skills.
5. Write the Paseo config while the daemon is stopped. `apply.sh` (see Update) does these steps for you. By hand:
   ```
   docker stop paseo
   docker run --rm --network none --user paseo --entrypoint node --volumes-from paseo paseo-vps:local \
     /home/paseo/.claude/scripts/paseo/build-config.js --host vps
   docker start paseo
   ```
6. Sign in (each command prints a URL; open it on any device and paste the code back):
   ```
   docker exec -it --user paseo paseo claude
   docker exec -it --user paseo -e SSH_CONNECTION=paseo -e AGY_CLI_FORCE_FILE_TOKEN_STORAGE=1 paseo agy
   ```
   Use `/login` in Claude Code. In agy, sign in with Google account A and quit without sending a prompt. `SSH_CONNECTION` selects the remote sign-in flow. `AGY_CLI_FORCE_FILE_TOKEN_STORAGE` stores the sign-in as the file `antigravity-oauth-token` in `<HOME>/.gemini/antigravity-cli`. Paseo uses the same variables.

   Then sign in Google account B. agy ignores `ANTIGRAVITY_APP_DATA_DIR`, so account B has its own HOME: `/home/paseo/.agy-homes/b`. `apply.sh` creates it. To create it now, run the first command. The sign-in page uses the Google account that is active in your browser. Open the URL in a private browser window and sign in there with account B:
   ```
   docker exec --user paseo paseo node /home/paseo/.claude/scripts/setup/agy-homes.js
   docker exec -it --user paseo -e HOME=/home/paseo/.agy-homes/b -e SSH_CONNECTION=paseo \
     -e AGY_CLI_FORCE_FILE_TOKEN_STORAGE=1 paseo agy
   ```
   Check: start agy once with each HOME. The banner shows the email of the account. A and B must show different emails. If B shows account A, remove `/home/paseo/.agy-homes/b/.gemini/antigravity-cli/antigravity-oauth-token` and sign in again.
7. Pair the devices: `docker exec -it --user paseo paseo paseo daemon pair`.
8. Turn on Paseo plugins yourself in a client (Settings), then enable quota-guard. The config build never does it.

## Update

| Part | How |
| --- | --- |
| Paseo | Change the tag and digest of `PASEO_IMAGE` in the Dockerfile, refresh the schema (`paseo/README.md`), redeploy |
| Claude Code | Change `CLAUDE_CODE_VERSION` in the `Dockerfile`, redeploy. The self-updater is off, because root owns the npm install |
| agy | Update `AGY_RELEASE` and both SHA-512 values in the Dockerfile, then rebuild |
| Config repo | On the VPS host: `bash /etc/dokploy/compose/<app>/code/docker/paseo-vps/apply.sh`. It pulls `~/.claude`, syncs agy and asks before it restarts the container for a stale Paseo config. `--yes` skips the question. Run the copy from the Dokploy checkout, never a copy from the container volume: agents can edit that volume |

Rust is not in the image. Install it into the home volume when a project needs it: `docker exec -it --user paseo paseo sh -c "curl -fsSL https://sh.rustup.rs | sh -s -- -y"`.

## Volumes

| Volume | Mount | Content |
| --- | --- | --- |
| `paseo-home` | `/home/paseo` | Sign-ins, `~/.claude`, `~/.paseo`, agent worktrees, uv Pythons |
| `paseo-workspace` | `/workspace` | Project checkouts |

`docker compose down -v` deletes both volumes and all sign-ins.

## If the container does not start

The entrypoint uses the listed capabilities to fix volume ownership, drop to `paseo` and forward signals. If `docker logs paseo` shows `Operation not permitted`, identify the failing command before changing the capability list.
