#!/usr/bin/env bash
# Builds programs/<program>/Dockerfile from the repository root.
# Usage: docker-build.sh <program> [--push]
# With --push, tags the image with the commit and dev and pushes it to GOHO_IMAGE_REGISTRY.

set -euo pipefail

readonly program="${1:?Usage: docker-build.sh <program> [--push]}"
readonly mode="${2:-}"
root="$(git rev-parse --show-toplevel)"
readonly root
readonly image="${GOHO_IMAGE_REGISTRY:-ghcr.io/adamaho}/$program"
readonly tag="${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}"

args=(--file "$root/programs/$program/Dockerfile" --tag "$image:$tag")
if [[ "$mode" == --push ]]; then
  args+=(
    --push
    --tag "$image:dev"
    --cache-from "type=registry,ref=$image:buildcache"
    --cache-to "type=registry,ref=$image:buildcache,mode=max"
  )
fi

docker buildx build "${args[@]}" "$root"
