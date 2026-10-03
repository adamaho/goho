#!/usr/bin/env bash
# Runs on the Goho server as the deploy user: bash -s -- <image> < deploy.sh
# Expects /opt/goho/compose.yml and the env files in /etc/goho.

set -euo pipefail

readonly image="${1:?Usage: deploy.sh <image>}"
readonly directory=/opt/goho

export GOHO_SERVER_IMAGE="$image"
GOHO_UID="$(id -u)"
GOHO_GID="$(id -g)"
export GOHO_UID GOHO_GID

compose=(docker compose --env-file /etc/goho/postgres.env -f "$directory/compose.yml")

"${compose[@]}" config --quiet
"${compose[@]}" pull --quiet server
"${compose[@]}" up --detach --wait --wait-timeout 180 --remove-orphans

# Remove superseded server images; the running one is kept.
docker image prune --all --force --filter label=org.opencontainers.image.title=goho-server >/dev/null

printf 'Goho server is healthy.\n'
