# Goho PostgreSQL systemd unit

Starts the [deployment Compose configuration](../../deployment/goho-postgres/docker-compose.yml)
and waits for Postgres to become healthy before the server starts.

Install through the [machine deployment installer](../../deployment/systemd.md#installation).
The installed unit uses `/etc/goho/compose.yml` and `/etc/goho/postgres.env`.
