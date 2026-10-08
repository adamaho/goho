#!/usr/bin/env bash
# Runs on the Goho server as the deploy user: bash -s -- <program> <image> < remote-deploy.sh
# Expects /opt/goho/<program>/compose.yml. Compose reads interpolation values,
# such as passwords, from /opt/goho/<program>/.env.

set -euo pipefail

readonly program="${1:?Usage: remote-deploy.sh <program> <image>}"
readonly image="${2:?Usage: remote-deploy.sh <program> <image>}"
readonly directory="/opt/goho/$program"

export GOHO_IMAGE="$image"
GOHO_UID="$(id -u)"
GOHO_GID="$(id -g)"
export GOHO_UID GOHO_GID

compose=(docker compose --project-directory "$directory" -f "$directory/compose.yml")

"${compose[@]}" config --quiet
"${compose[@]}" pull --quiet
"${compose[@]}" up --detach --wait --wait-timeout 180 --remove-orphans

# Remove superseded images of this program; the running one is kept.
docker image prune --all --force --filter "label=org.opencontainers.image.title=$program" >/dev/null

printf '%s is healthy.\n' "$program"
