#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_DIR="/home/adam/github.com/adamaho/goho"
readonly LOCK_FILE="/run/goho/receipts.lock"
readonly PNPM="/home/adam/.local/share/pnpm/bin/pnpm"

require_environment_variable() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable %s is missing or empty.\n' "$name" >&2
    exit 64
  fi
}

require_environment_variable GOHO_RECEIPTS_ROOT_FOLDER_ID
require_environment_variable GOHO_RECEIPTS_SPREADSHEET_ID

readonly CONCURRENCY="${GOHO_RECEIPTS_CONCURRENCY:-5}"

if [[ ! "$CONCURRENCY" =~ ^[1-5]$ ]]; then
  printf 'GOHO_RECEIPTS_CONCURRENCY must be an integer from 1 through 5.\n' >&2
  exit 64
fi

if [[ ! -d "$REPOSITORY_DIR" ]]; then
  printf 'Goho repository does not exist: %s\n' "$REPOSITORY_DIR" >&2
  exit 72
fi

if [[ ! -x "$PNPM" ]]; then
  printf 'pnpm executable does not exist: %s\n' "$PNPM" >&2
  exit 69
fi

cd "$REPOSITORY_DIR"

exec /usr/bin/flock \
  --nonblock \
  --conflict-exit-code 75 \
  "$LOCK_FILE" \
  "$PNPM" --filter @goho/goho-cli start \
  --log-level debug \
  receipts process \
  "$GOHO_RECEIPTS_ROOT_FOLDER_ID" \
  "$GOHO_RECEIPTS_SPREADSHEET_ID" \
  --concurrency "$CONCURRENCY"
