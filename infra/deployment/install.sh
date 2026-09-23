#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SERVICE_PATH="/home/adam/.local/share/mise/shims:/home/adam/.local/share/pnpm:/home/adam/.local/bin:/usr/local/bin:/usr/bin:/bin"

if [[ "$EUID" -ne 0 ]]; then
  printf 'Run this installer with sudo.\n' >&2
  exit 1
fi

if [[ "$REPOSITORY_DIR" != /home/adam/github.com/adamaho/goho ]]; then
  printf 'The service units require the checkout at /home/adam/github.com/adamaho/goho.\n' >&2
  exit 1
fi

if [[ ! -f /etc/goho/server.env ]]; then
  printf 'Missing existing configuration: /etc/goho/server.env\n' >&2
  exit 1
fi

cd "$REPOSITORY_DIR"
for tool in runuser curl python3; do
  command -v "$tool" >/dev/null
done
runuser -u adam -- env HOME=/home/adam PATH="$SERVICE_PATH" node --version
runuser -u adam -- env HOME=/home/adam PATH="$SERVICE_PATH" pnpm --version
runuser -u adam -- env HOME=/home/adam PATH="$SERVICE_PATH" pnpm install --frozen-lockfile

if [[ -f /etc/systemd/system/goho-receipts.timer ]]; then
  systemctl stop goho-receipts.timer
fi
if [[ -f /etc/systemd/system/goho-receipts.service ]]; then
  batch_state="$(systemctl show goho-receipts.service -p ActiveState --value)"
  if [[ "$batch_state" == active || "$batch_state" == activating || "$batch_state" == deactivating ]]; then
    printf 'A legacy receipt batch is active. Wait for it to finish, then rerun this installer. The timer is paused.\n' >&2
    exit 1
  fi
fi
apt-get update
apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker.service
docker compose version

systemctl stop goho-server.service
install -d -o root -g adam -m 0750 /etc/goho
python3 - <<'PY'
import os
import secrets
from pathlib import Path
from urllib.parse import quote

postgres = Path('/etc/goho/postgres.env')
if not postgres.exists():
    fd = os.open(postgres, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(f'POSTGRES_PASSWORD={secrets.token_hex(32)}\n')
settings = dict(
    line.split('=', 1)
    for line in postgres.read_text().splitlines()
    if line.strip() and not line.lstrip().startswith('#')
)
password = settings.get('POSTGRES_PASSWORD', '')
if not password or any(character in password for character in '\n\r'):
    raise SystemExit('Invalid POSTGRES_PASSWORD in /etc/goho/postgres.env')
os.chmod(postgres, 0o600)
server = Path('/etc/goho/server.env')
lines = [
    line for line in server.read_text().splitlines()
    if not line.strip().startswith(('DATABASE_URL=', 'GOOGLE_DRIVE_UPLOAD_FOLDER_ID=', 'GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE=', 'GOOGLE_AUTH_SCOPES='))
]
lines.append(f'DATABASE_URL=postgresql://goho:{quote(password, safe="")}@127.0.0.1:5434/goho')
if not any(line.strip().startswith('GOHO_UPLOADS_DIRECTORY=') for line in lines):
    lines.append('GOHO_UPLOADS_DIRECTORY=/var/lib/goho/receipt-uploads')
server.write_text('\n'.join(lines) + '\n')
PY
chown root:adam /etc/goho/server.env
chmod 0640 /etc/goho/server.env
uploads_directory="$(python3 - <<'PY'
from pathlib import Path

settings = dict(
    line.split('=', 1)
    for line in Path('/etc/goho/server.env').read_text().splitlines()
    if '=' in line and not line.lstrip().startswith('#')
)
directory = Path(settings.get('GOHO_UPLOADS_DIRECTORY', '').strip())
if not directory.is_absolute() or directory == Path('/'):
    raise SystemExit('GOHO_UPLOADS_DIRECTORY in /etc/goho/server.env must be an absolute non-root path')
print(directory)
PY
)"
install -d -o adam -g adam -m 0700 "$uploads_directory"
server_port="$(python3 - <<'PY'
from pathlib import Path
settings = dict(
    line.split('=', 1)
    for line in Path('/etc/goho/server.env').read_text().splitlines()
    if '=' in line and not line.lstrip().startswith('#')
)
port = settings.get('GOHO_SERVER_PORT', '3000').strip()
if not port.isdecimal() or not 1 <= int(port) <= 65535:
    raise SystemExit('Invalid GOHO_SERVER_PORT in /etc/goho/server.env')
print(port)
PY
)"

install -o root -g root -m 0644 infra/deployment/goho-postgres/docker-compose.yml /etc/goho/compose.yml
install -o root -g root -m 0644 infra/systemd/goho-postgres/goho-postgres.service /etc/systemd/system/goho-postgres.service
install -o root -g root -m 0644 infra/systemd/goho-server/goho-server.service /etc/systemd/system/goho-server.service
install -d -o root -g root -m 0755 /etc/systemd/system/goho-server.service.d
install -o root -g root -m 0644 infra/systemd/goho-server/postgres.conf /etc/systemd/system/goho-server.service.d/postgres.conf

docker compose --env-file /etc/goho/postgres.env -f /etc/goho/compose.yml config --quiet
docker compose --env-file /etc/goho/postgres.env -f /etc/goho/compose.yml pull
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/goho-postgres.service /etc/systemd/system/goho-server.service
systemctl reset-failed goho-server.service
systemctl enable --now goho-postgres.service
systemctl enable goho-server.service
systemctl restart goho-server.service

server_ready=false
for attempt in {1..30}; do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 \
    "http://127.0.0.1:$server_port/health" || true)"
  if [[ "$status" == 200 && "$(systemctl is-active goho-server.service)" == active ]]; then
    server_ready=true
    break
  fi
  sleep 1
done
if [[ "$server_ready" != true ]]; then
  printf 'Server readiness failed. Inspect journalctl -u goho-server.service. Any legacy receipt timer remains paused.\n' >&2
  exit 1
fi

docker compose --env-file /etc/goho/postgres.env -f /etc/goho/compose.yml exec -T postgres \
  psql -U goho -d goho -c 'SELECT migration_id, name FROM goho_migrations ORDER BY migration_id;'
if [[ -f /etc/systemd/system/goho-receipts.timer ]]; then
  systemctl disable goho-receipts.timer
  rm -- /etc/systemd/system/goho-receipts.timer
fi
if [[ -f /etc/systemd/system/goho-receipts.service ]]; then
  rm -- /etc/systemd/system/goho-receipts.service
fi
systemctl daemon-reload
printf 'Goho is listening on http://127.0.0.1:%s. Postgres is on 127.0.0.1:5434. The legacy receipt timer is retired.\n' "$server_port"
