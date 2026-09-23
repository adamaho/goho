# Service supervision

Each service has the same directory name here and in
[`infra/deployment`](../deployment/README.md). This folder contains systemd units,
timers, drop-ins, and service scripts. Deployment contains the corresponding
runtime configuration and the overall machine installer.

- `goho-postgres`: starts Docker Compose and waits for database health.
- `goho-server`: runs migrations and starts the API. `postgres.conf` adds the
  dependency on the deployed Postgres service.

Use the [deployment installer](../deployment/README.md#installation) to install
the complete stack. Source files are copied to `/etc/goho` and
`/etc/systemd/system`; moving source configuration does not update installed units.
The receipt runner is executed directly from this checkout.
