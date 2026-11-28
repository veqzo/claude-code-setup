# syntax=docker/dockerfile:1
#
# Paseo host #2: the official Paseo image plus the agent CLIs and toolchains.
# Base image facts (Paseo v0.17.5, docker/base/Dockerfile): node:22-bookworm-slim,
# user paseo (1000:1000), HOME=/home/paseo, VOLUME /home/paseo, WORKDIR /workspace.
# The entrypoint starts as root, fixes volume ownership, then drops to paseo.
#
# No secret goes into this file or a build arg. Tokens come from the Dokploy
# environment at run time (see compose.yaml and .env.example).

# Base images are pinned by tag and multi-arch index digest. To update Paseo,
# change both parts (`docker buildx imagetools inspect <image>:<tag>` prints the
# digest) and refresh the schema (paseo/README.md).
ARG PASEO_IMAGE=ghcr.io/getpaseo/paseo:0.17.5@sha256:321c8361600602c6e1f1c7a492efc0efa251609730b4086c2f973ad3f14f848d
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.10@sha256:a3ea1357342c1a4bf9a0c53a3deb1b55379aefa037338d8113d5771efa01774f

FROM ${UV_IMAGE} AS uv

FROM ${PASEO_IMAGE}

ARG TARGETARCH
ARG CLAUDE_CODE_VERSION=2.1.332
ARG JDK_MAJOR=21

# Antigravity CLI release. Take all three values from the same version of the
# installer manifests:
# https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json
# https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_arm64.json
# AGY_RELEASE is the path segment of "url" after antigravity-cli/.
ARG AGY_RELEASE=1.5.18-6386224290725888
ARG AGY_SHA512_AMD64=ef379ec869719112f696e8c7cfddf776618712e58fc38e53df80801d6528abb4677782c7c8778f9c09c9123fa44c2c32675d228c06f2a8f7a8f4214e75f5bb26
ARG AGY_SHA512_ARM64=6c59cbce5a7632083dd4ef594296e52ce0abdc12f8b4ecb55523e093748cf178f8f8383d7e51e9ed7859ea6e46c83a43a7b46364b0e033dd13afb24d6bfbe4c8

# Claude Code and agy are pinned and owned by root, so agents cannot replace
# them and the self-updaters stay off. Update them with new values and a
# rebuild. AGY_CLI_DISABLE_AUTO_UPDATE is not documented: the name comes from
# the agy 1.5.18 binary. Root ownership blocks the update also without it.
ENV DISABLE_AUTOUPDATER=1 \
    AGY_CLI_DISABLE_AUTO_UPDATE=1 \
    PATH=/opt/agy/bin:${PATH}

USER root

# Toolchains: gh (GitHub CLI), Temurin JDK for Kotlin/Gradle, jq and ripgrep for
# agents, build-essential as the C linker for Python wheels and Rust.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends gnupg; \
    install -d -m 0755 /etc/apt/keyrings; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg; \
    chmod 0644 /etc/apt/keyrings/*.gpg; \
    arch="$(dpkg --print-architecture)"; \
    echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list; \
    echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" \
      > /etc/apt/sources.list.d/adoptium.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      build-essential \
      gh \
      jq \
      ripgrep \
      "temurin-${JDK_MAJOR}-jdk" \
      unzip; \
    apt-get purge -y --auto-remove gnupg; \
    rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

RUN set -eux; \
    npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"; \
    npm cache clean --force; \
    claude --version

# Antigravity CLI from the pinned release. The SHA-512 is committed in this
# file, so a changed download stops the build.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) dir=linux-x64; file=cli_linux_x64.tar.gz; sha="${AGY_SHA512_AMD64}" ;; \
      arm64) dir=linux-arm; file=cli_linux_arm64.tar.gz; sha="${AGY_SHA512_ARM64}" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    mkdir -p /tmp/agy /opt/agy/bin; \
    curl -fsSL -o /tmp/agy/agy.tar.gz \
      "https://storage.googleapis.com/antigravity-public/antigravity-cli/${AGY_RELEASE}/${dir}/${file}"; \
    echo "${sha}  /tmp/agy/agy.tar.gz" | sha512sum -c -; \
    tar -xzf /tmp/agy/agy.tar.gz -C /tmp/agy antigravity; \
    install -m 0755 -o root -g root /tmp/agy/antigravity /opt/agy/bin/agy; \
    rm -rf /tmp/agy; \
    /opt/agy/bin/agy --version

COPY --chmod=0755 bootstrap.sh /usr/local/bin/paseo-vps-bootstrap

# Stay root: the base entrypoint drops the daemon and every agent to paseo.
