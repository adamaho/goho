#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_DIR="/home/adam/github.com/adamaho/goho"
readonly SOURCE_DIR="$REPOSITORY_DIR/infra/systemd/goho-receipts"
readonly CONFIG_DIR="/etc/goho"
readonly SYSTEMD_DIR="/etc/systemd/system"
readonly SERVICE_UNIT="goho-receipts.service"
readonly TIMER_UNIT="goho-receipts.timer"

if [[ $EUID -ne 0 ]]; then
  printf 'Run this installer with sudo.\n' >&2
  exit 1
fi

if ! getent passwd adam >/dev/null; then
  printf 'The required systemd user "adam" does not exist.\n' >&2
  exit 1
fi

if [[ ! -f "$REPOSITORY_DIR/package.json" ]]; then
  printf 'Goho repository was not found at %s.\n' "$REPOSITORY_DIR" >&2
  exit 1
fi

if [[ ! -x "$SOURCE_DIR/run.sh" ]]; then
  printf '%s is missing or not executable.\n' "$SOURCE_DIR/run.sh" >&2
  exit 1
fi

if [[ ! -x /home/adam/.local/share/pnpm/bin/pnpm ]]; then
  printf 'pnpm is not installed at the path expected by the service.\n' >&2
  exit 1
fi

if [[ ! -x /usr/bin/flock ]]; then
  printf 'flock is not installed at the path expected by the service.\n' >&2
  exit 1
fi

install -d -o root -g adam -m 0750 "$CONFIG_DIR"

if [[ ! -e "$CONFIG_DIR/receipts.env" ]]; then
  install -o root -g adam -m 0640 \
    "$SOURCE_DIR/.env.example" \
    "$CONFIG_DIR/receipts.env"
  printf 'Created %s from the tracked example.\n' "$CONFIG_DIR/receipts.env"
else
  chown root:adam "$CONFIG_DIR/receipts.env"
  chmod 0640 "$CONFIG_DIR/receipts.env"
  printf 'Preserved existing %s.\n' "$CONFIG_DIR/receipts.env"
fi

install -o root -g root -m 0644 \
  "$SOURCE_DIR/$SERVICE_UNIT" \
  "$SYSTEMD_DIR/$SERVICE_UNIT"

install -o root -g root -m 0644 \
  "$SOURCE_DIR/$TIMER_UNIT" \
  "$SYSTEMD_DIR/$TIMER_UNIT"

systemctl daemon-reload
systemd-analyze verify "$SYSTEMD_DIR/$SERVICE_UNIT" "$SYSTEMD_DIR/$TIMER_UNIT"

cat <<EOF

Installed $SERVICE_UNIT and $TIMER_UNIT.

The timer has not been enabled. Next:
  1. Configure $CONFIG_DIR/receipts.env.
  2. Configure and start goho-server (see infra/systemd/goho-server/README.md).
  3. Test with: sudo systemctl start $SERVICE_UNIT
  4. Inspect with: journalctl -u $SERVICE_UNIT
  5. Enable with: sudo systemctl enable --now $TIMER_UNIT
EOF
