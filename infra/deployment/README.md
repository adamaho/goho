# Local machine deployment

This setup runs the server under systemd and PostgreSQL 18 under Docker Compose.
It uses the service account and checkout path configured in the systemd unit,
with server configuration in `/etc/goho/server.env`.

## Layout

`infra/deployment` and `infra/systemd` use matching service directories.
Deployment contains runtime configuration; systemd contains the units and scripts
that supervise those services. The installer here connects the two.

| Service         | Deployment configuration | systemd files                               |
| --------------- | ------------------------ | ------------------------------------------- |
| `goho-postgres` | `docker-compose.yml`     | Postgres startup unit                       |
| `goho-server`   | `.env.example`           | Server unit and Postgres dependency drop-in |

`infra/local` remains the separate development and integration-test database setup.

## Installation

Install from the repository root:

```bash
sudo bash infra/deployment/install.sh
```

The installer verifies the service runtime and installs workspace dependencies,
pauses any installed legacy receipt timer and refuses to interrupt an active batch.
It installs Ubuntu's `docker.io` and `docker-compose-v2` packages, enables Docker,
and creates `/etc/goho/postgres.env` with a generated password on first use.
Reruns preserve that password and the existing application credentials, updating
`DATABASE_URL` and adding the default `GOHO_UPLOADS_DIRECTORY` when it is absent.
The installer creates that receipt storage directory for the configured
service account with mode `0700`; include it in host backups.

The deployment API defaults to `127.0.0.1:13000` and Postgres listens on
`127.0.0.1:5434`, leaving ports `3000` and `5432` for development. Existing
installations keep their configured API port until `/etc/goho/server.env` is
updated and `goho-server.service` is restarted. The `goho-deployment` Compose
project has its own named data volume, separate from development and integration
tests. The Compose definition is installed at `/etc/goho/compose.yml`; no reset
command or backups are included.

The installer updates the Goho service unit and adds a server dependency on
`goho-postgres.service`. That unit waits for Postgres health before server
migrations run. The service PATH includes this machine's mise Node shims and
pnpm installation. After the health endpoint responds and migration history can be
read, the installer disables and removes any installed legacy receipt timer and service.

Check the deployment:

```bash
systemctl status goho-postgres.service goho-server.service
journalctl -u goho-server.service -n 50 --no-pager
sudo docker compose --env-file /etc/goho/postgres.env -f /etc/goho/compose.yml ps
```

If installation fails after pausing a legacy timer, it remains paused. Fix the
reported error and rerun the installer. Existing receipt and upload data are not removed.
