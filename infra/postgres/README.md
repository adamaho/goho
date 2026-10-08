# Shared Postgres

The production Postgres 18 server that Goho programs share on the Goho server.
It runs as its own Compose stack, so programs can be deployed, restarted or
removed without touching the database.

The deploy workflow treats this package like a program: changes here deploy it
with `pnpm turbo run deploy --filter=@goho/infra-postgres`, and nothing else.
[`scripts/deploy.sh`](./scripts/deploy.sh) copies [`compose.yml`](./compose.yml)
to `/opt/goho/postgres/`, creates the `goho` Docker network if needed, and waits
for the database to be healthy.

Programs join the external `goho` network in their own Compose files and connect
to `postgres:5432`. Postgres reads its password from `/opt/goho/postgres/.env`,
a link to `/etc/goho/postgres.env`; see the
[server deployment guide](../../programs/goho-server/CONTRIBUTING.md#deployment)
for host setup. Data lives in the `goho-postgres-data` volume. The database
listens on `127.0.0.1:5434` on the host for maintenance.

To give another program its own database, create a database and role for it
on this server rather than adding a Postgres service to the program's stack.
