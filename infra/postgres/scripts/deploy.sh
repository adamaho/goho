#!/usr/bin/env bash
# Applies the shared Postgres stack on the Goho server over Tailscale SSH.
# Run it through Turbo: pnpm turbo run deploy --filter=@goho/infra-postgres
# Requires GOHO_DEPLOY_HOST.

set -euo pipefail

readonly target="goho@${GOHO_DEPLOY_HOST:?Set GOHO_DEPLOY_HOST to the Tailscale name of the server}"
readonly directory=/opt/goho/postgres
readonly compose_file="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/compose.yml"
readonly ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR)

ssh "${ssh_options[@]}" "$target" "mkdir -p $directory && cat > $directory/compose.yml" < "$compose_file"
ssh "${ssh_options[@]}" "$target" bash -s -- "$directory" <<'REMOTE'
set -euo pipefail
directory="$1"
docker network inspect goho >/dev/null 2>&1 || docker network create goho >/dev/null
docker compose --project-directory "$directory" -f "$directory/compose.yml" up --detach --wait --wait-timeout 180 --remove-orphans
printf 'postgres is healthy.\n'
REMOTE
