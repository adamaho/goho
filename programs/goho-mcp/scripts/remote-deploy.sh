#!/usr/bin/env bash
# Runs on the Goho server as the deploy user: ssh ... bash -s -- <program> <image> [docker-config] < remote-deploy.sh
# scripts/deploy.ts sends it over Tailscale SSH after copying compose.yml to
# /opt/goho/<program>/compose.yml.

set -euo pipefail

readonly program="${1:?Usage: remote-deploy.sh <program> <image>}"
readonly image="${2:?Usage: remote-deploy.sh <program> <image>}"
readonly directory="/opt/goho/$program"

# CI gives each parallel deployment its own registry credentials on this host.
if [[ -n "${3:-}" ]]; then
  export DOCKER_CONFIG="$3"
fi

export GOHO_IMAGE="$image"
GOHO_UID="$(id -u)"
GOHO_GID="$(id -g)"
export GOHO_UID GOHO_GID

compose=(docker compose --project-directory "$directory" -f "$directory/compose.yml")

# Programs share the `goho` network; whichever deploys first creates it.
docker network inspect goho >/dev/null 2>&1 || docker network create goho >/dev/null

"${compose[@]}" config --quiet
"${compose[@]}" pull --quiet
"${compose[@]}" up --detach --wait --wait-timeout 180 --remove-orphans

# Remove superseded images of this program; the running one is kept.
docker image prune --all --force --filter "label=org.opencontainers.image.title=$program" >/dev/null

printf '%s is healthy.\n' "$program"
