#!/usr/bin/env bash
# Builds and pushes a program's image, then deploys it to the Goho server over
# Tailscale SSH using infra/deployment/<program>/compose.yml.
# Usage: deploy.sh <program>. Requires GOHO_DEPLOY_HOST and a registry login.

set -euo pipefail

readonly program="${1:?Usage: deploy.sh <program>}"
readonly scripts="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly compose_file="$scripts/../$program/compose.yml"
readonly target="goho@${GOHO_DEPLOY_HOST:?Set GOHO_DEPLOY_HOST to the Tailscale name of the server}"
root="$(git rev-parse --show-toplevel)"
readonly image="${GOHO_IMAGE_REGISTRY:-ghcr.io/adamaho}/$program:${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}"
readonly ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR)

if [[ ! -f "$compose_file" ]]; then
  printf 'Missing %s\n' "infra/deployment/$program/compose.yml" >&2
  exit 1
fi

bash "$scripts/docker-build.sh" "$program" --push
ssh "${ssh_options[@]}" "$target" "mkdir -p /opt/goho/$program && cat > /opt/goho/$program/compose.yml" < "$compose_file"
ssh "${ssh_options[@]}" "$target" bash -s -- "$program" "$image" < "$scripts/remote-deploy.sh"
