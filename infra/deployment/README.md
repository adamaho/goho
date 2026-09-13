# Local machine deployment

This setup runs the server under systemd and PostgreSQL 18 under Docker Compose.
It targets the existing `adam` user, checkout at
`/home/adam/github.com/adamaho/goho`, and credentials in `/etc/goho/server.env`
and `/etc/goho/receipts.env`.

## Layout

`infra/deployment` and `infra/systemd` use matching service directories.
Deployment contains runtime configuration; systemd contains the units and scripts
that supervise those services. The installer here connects the two.

| Service         | Deployment configuration | systemd files                                         |
| --------------- | ------------------------ | ----------------------------------------------------- |
| `goho-postgres` | `docker-compose.yml`     | Postgres startup unit                                 |
| `goho-server`   | `.env.example`           | Server unit and Postgres dependency drop-in           |
| `goho-receipts` | `.env.example`           | Receipt unit, timer, runner, and standalone installer |

`infra/local` remains the separate development and integration-test database setup.

## Installation

Install from the repository root:

```bash
sudo bash infra/deployment/install.sh
```

The installer verifies the service runtime and installs workspace dependencies,
pauses the receipt timer, and refuses to interrupt an active scheduled batch.
It installs Ubuntu's `docker.io` and `docker-compose-v2` packages, enables Docker,
and creates `/etc/goho/postgres.env` with a generated password on first use.
Reruns preserve that password and the existing application credentials, updating
only `DATABASE_URL` in the server environment file.

Postgres listens on `127.0.0.1:5434`. The `goho-deployment` Compose project has its
own named data volume, separate from development and integration tests. The
Compose definition is installed at `/etc/goho/compose.yml`; no reset command or
backups are included.

The installer updates both Goho service units and adds a server dependency on
`goho-postgres.service`. That unit waits for Postgres health before server
migrations run. The service PATH includes this machine's mise Node shims and
pnpm installation. The receipt timer is re-enabled only after the HTTP endpoint
responds with the expected validation error and migration history can be read.
The readiness request contains invalid input and does not process Drive files.

Check the deployment:

```bash
systemctl status goho-postgres.service goho-server.service goho-receipts.timer
journalctl -u goho-server.service -n 50 --no-pager
sudo docker compose --env-file /etc/goho/postgres.env -f /etc/goho/compose.yml ps
```

If installation fails after pausing the timer, it remains paused. Fix the
reported error and rerun the installer. Before later server restarts, pause the
timer and wait for all active processing, including manually submitted batches,
to finish. The installer can detect the scheduled service but cannot detect a
batch initiated by another HTTP client.
