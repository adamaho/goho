# Contributing to @goho/goho-server

Follow the repository-wide guidance in the root
[CONTRIBUTING.md](../../CONTRIBUTING.md) in addition to this package-specific
setup.

## Prerequisites

### Development environment

Follow the root [development setup](../../CONTRIBUTING.md#development-setup)
to install Node.js, pnpm, and workspace dependencies before running server commands.

### OpenAI API key

1. Create an API key from the
   [OpenAI API keys](https://platform.openai.com/api-keys) page.
2. Ensure the OpenAI project has access to the model configured by
   `OPENAI_MODEL` and has billing configured as needed.
3. Store the key only in `programs/goho-server/.env` as `OPENAI_API_KEY`. The local
   environment file is ignored by Git.

## Runtime configuration

Configure the environment file before starting:

- `GOHO_SERVER_PORT`: defaults to `3000`.
- `DATABASE_URL`: required PostgreSQL connection URL. The pool must connect at startup.
- `GOHO_UPLOADS_DIRECTORY`: required directory for durable original receipt files.
- `OPENAI_API_KEY`: OpenAI secret.
- `OPENAI_MODEL`: extraction model.

## Local Setup

Copy the environment template:

```bash
cp programs/goho-server/.env.example programs/goho-server/.env
```

Set `OPENAI_API_KEY` and adjust `OPENAI_MODEL` if needed.

Start the database, apply migrations, and start the server:

```bash
pnpm --filter @goho/infra-local infra:up
pnpm --filter @goho/goho-server db:migrate
pnpm --filter @goho/goho-server start
```

In a second terminal, seed the local database after the server is ready:

```bash
pnpm --filter @goho/goho-server db:seed
```

The seed command creates four fictional receipts through the receipt creation
API. It uses `http://127.0.0.1:3000` by default; set `GOHO_SERVER_URL` to target
another local server. Stable idempotency keys make reruns return the same
receipts without duplicates. Keep a key stable while its fixture stays the
same, and use a new key version when changing a fixture. Seeding does not
upload images or call OpenAI.

Then configure and run the [CLI](../goho-cli/README.md). Use
`pnpm --filter @goho/goho-server dev` for watch mode.

## Verification

Run the repository checks before submitting changes:

```bash
pnpm check
```

## Database changes

Use the shared Postgres layer from `@goho/core`. Keep receipt tables, migrations,
and repository behavior in this server.

### Receipt schema

`receipts` retains the source provider/file identity, original file name, store,
receipt date, category, subtotal, tax, total, nullable currency, extraction
version, validated extraction JSON, and creation time. `receipt_items` stores
ordered item names and amounts, linked to a receipt. Dates use `date`, creation
times use `timestamptz`, and amounts use `numeric` without two-decimal rounding.
Currency remains unknown with the current extraction contract. API-created
receipts accept a currency or null and use an idempotency key instead of source
metadata. See [receipt creation](./README.md#create-a-receipt).

Decimal strings preserve the finite numeric values supplied by the parser; they
cannot recover precision already lost upstream.

The repository inserts a receipt and all its items in one transaction. For
receipts with source provider/file metadata, the first successful save for that
identity wins; subsequent saves return the existing receipt ID without replacing
data or duplicating items.
Repeated item names are allowed because identity uses position within a receipt.

### Running migrations locally

Set `DATABASE_URL` in `programs/goho-server/.env`. The example points to the local
Compose database. From the repository root:

```bash
pnpm --filter @goho/infra-local infra:up
pnpm --filter @goho/goho-server db:migrate
```

`infra:up` starts Postgres and creates the database on its first startup.
`db:migrate` connects to that database and creates or updates its tables. These
are separate commands. Neither `start` nor `dev` runs migrations automatically.
The [systemd unit](#systemd-service) runs `db:migrate`
automatically before launching the server on each start or restart. For other
deployments, run it explicitly before starting the new server version. CI does
not migrate deployment databases.

### How the runner works

`src/database/migrate.ts` loads the connection and calls the registry in
`src/database/migrations.ts`. The registry uses Effect's `PgMigrator.fromRecord`
and `PgMigrator.run`.

The runner creates `goho_migrations` if needed, reads the highest completed
migration ID, and runs registered migrations with higher IDs in numeric order.
It records their IDs, names, and completion timestamps. Pending migrations and
their history entries run in one transaction: a failure rolls back that pending
batch. The history table itself may remain after an unsuccessful first run.
Rerunning a completed batch does nothing. Applied files are not checksummed or
rerun when their contents change.

### Adding a migration

1. Create the next numbered file under `src/database/migrations`, for example
   `0002-receipt-notes.ts`. Use a unique ID higher than every existing migration;
   do not insert an older number into the sequence.
2. Default-export an `Effect.gen` that obtains `SqlClient.SqlClient` and executes
   the SQL changes, following `0001-receipts.ts`. Use SQL that can run inside a
   transaction; operations such as `CREATE INDEX CONCURRENTLY` cannot run here.
3. Import the file in `src/database/migrations.ts` and add it to the record, for
   example `"0002_receipt_notes": receiptNotes`. The registry key uses an
   underscore after the numeric ID; the file name uses kebab-case. Files are not
   discovered automatically, and there is no migration generator.
4. Run `db:migrate` locally, then run it again to confirm no migrations remain.
   Add an integration assertion for the resulting schema or behavior. For a
   change that transforms existing data, test upgrading a populated old schema
   as well as creating a fresh database.
5. Commit the new file and registry entry with the code that uses the schema.
   Once a migration has been applied to a shared database, leave it unchanged;
   make corrections in a new migration. There is no down/rollback command.

### Tests

Test selection lives in `vitest.config.ts`, with named `unit` and `integration`
projects. Unit tests exclude `*.integration.test.ts` and do not need a database:

```bash
pnpm --filter @goho/goho-server test:unit
```

For integration tests, start the isolated test database documented in
[local infrastructure](../../infra/local/README.md), supply `TEST_DATABASE_URL`,
and run `pnpm --filter @goho/goho-server test:integration`. Each repository test
creates a temporary schema, applies the real migration registry, and drops the
schema afterward. No Google or OpenAI credentials are required.

Database configuration and initial connectivity are required at server startup.
The systemd unit applies migrations before launching the server. Direct launches
with `start` or `dev` require the separate migration command first.

## Systemd service

For this machine's Docker Compose deployment and automated installation, see
[local machine deployment](../../infra/deployment/README.md).

Run the installation commands below from the repository root.

This unit targets the existing `adam` user and checkout at
`/home/adam/github.com/adamaho/goho`.

### Runtime setup

Install Node.js and pnpm at the versions required by the root `package.json`,
then run `pnpm install --frozen-lockfile` in the checkout as `adam`.
The service unit uses this explicit `PATH`:

```text
/home/adam/.local/share/mise/shims:/home/adam/.local/share/pnpm:/home/adam/.local/bin:/usr/local/bin:/usr/bin:/bin
```

Ensure both executables are available to `adam` on that path. The service does
not load interactive shell profiles. If your tools live elsewhere, set
`Environment="PATH=..."` with the complete path in a systemd override for each
service. Check the versions with that same path before starting it.

### Install the service

```bash
sudo install -d -o root -g adam -m 0750 /etc/goho
sudo install -o root -g adam -m 0640 infra/deployment/goho-server/.env.example /etc/goho/server.env
sudo install -o root -g root -m 0644 infra/systemd/goho-server/goho-server.service /etc/systemd/system/goho-server.service
```

The environment install command is for first setup; preserve an existing file.
Configure `/etc/goho/server.env` and `DATABASE_URL` for a PostgreSQL 18 database reachable from this host.
The database must be running when the service starts. `ExecStartPre` runs
`db:migrate` as `adam`, using the same working directory, PATH, and environment
file as the server. Each start or restart applies pending migrations before
starting the HTTP server. If migrations fail, the server does not start; the
existing `Restart=on-failure` policy retries after five seconds, subject to
systemd's start-rate limit. Inspect migration output in the service journal.
The unit does not provision PostgreSQL. The server listens on `127.0.0.1`
without authentication.

```bash
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/goho-server.service
sudo systemctl enable --now goho-server.service
journalctl -u goho-server.service
```

For an existing installation, copy the updated unit with the `sudo install`
command above and run `sudo systemctl daemon-reload`, then restart the service
after draining active work. Updating the checkout alone does not update the
installed unit.

The deployment installer retires any installed legacy receipt timer after the
replacement server passes its health check. Provider failure causes appear in the
server journal; review before sharing.
