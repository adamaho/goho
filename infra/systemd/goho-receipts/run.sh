#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_DIR="/home/adam/github.com/adamaho/goho"
readonly LOCK_FILE="/run/goho/receipts.lock"
readonly NIX="/nix/var/nix/profiles/default/bin/nix"

require_environment_variable() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    printf 'Required environment variable %s is missing or empty.\n' "$name" >&2
    exit 64
  fi
}

require_environment_variable GOHO_RECEIPTS_ROOT_FOLDER_ID
require_environment_variable GOHO_RECEIPTS_SPREADSHEET_ID
require_environment_variable GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE
require_environment_variable GOOGLE_AUTH_SCOPES
require_environment_variable OPENAI_API_KEY
require_environment_variable OPENAI_MODEL

readonly CONCURRENCY="${GOHO_RECEIPTS_CONCURRENCY:-5}"

if [[ ! "$CONCURRENCY" =~ ^[1-5]$ ]]; then
  printf 'GOHO_RECEIPTS_CONCURRENCY must be an integer from 1 through 5.\n' >&2
  exit 64
fi

if [[ ! -r "$GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE" ]]; then
  printf 'Google service-account key file is not readable: %s\n' \
    "$GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE" >&2
  exit 66
fi

if [[ ! -d "$REPOSITORY_DIR" ]]; then
  printf 'Goho repository does not exist: %s\n' "$REPOSITORY_DIR" >&2
  exit 72
fi

if [[ ! -x "$NIX" ]]; then
  printf 'Nix executable does not exist: %s\n' "$NIX" >&2
  exit 69
fi

cd "$REPOSITORY_DIR"

exec /usr/bin/flock \
  --nonblock \
  --conflict-exit-code 75 \
  "$LOCK_FILE" \
  "$NIX" develop --no-write-lock-file --command \
  pnpm --filter @goho/goho-cli start \
  --log-level debug \
  receipts process \
  "$GOHO_RECEIPTS_ROOT_FOLDER_ID" \
  "$GOHO_RECEIPTS_SPREADSHEET_ID" \
  --concurrency "$CONCURRENCY"
