# Contributing to @goho/goho-server

Follow the repository-wide guidance in the root
[CONTRIBUTING.md](../../CONTRIBUTING.md) in addition to this package-specific
setup.

## Prerequisites

### Development environment

Follow the root [development setup](../../CONTRIBUTING.md#development-setup)
to install Node.js, pnpm, and workspace dependencies before running server commands.

## Runtime configuration

Configure the environment file before starting:

- `GOHO_SERVER_PORT`: defaults to `3000`.
- `DATABASE_URL`: required PostgreSQL connection URL. The pool must connect at startup.
- `GOHO_UPLOADS_DIRECTORY`: required directory for durable original receipt files.
- `OPENAI_API_KEY`: nonempty local placeholder, or a real key for image extraction.
- `OPENAI_MODEL`: model used for image extraction.

## Local Setup

Copy the environment template:

```bash
cp programs/goho-server/.env.example programs/goho-server/.env
```

The example contains a nonempty OpenAI placeholder. It is enough to start the
server and work with receipts created through the API or seed command.

From the repository root, start PostgreSQL, apply migrations, and run the
server in watch mode with one command:

```bash
pnpm server:dev
```

In a second terminal, seed the local database after the server is ready:

```bash
pnpm --filter @goho/goho-server db:seed
```

The seed command creates four fictional receipts through the receipt creation
API. It uses `http://127.0.0.1:3000` by default; set `GOHO_SERVER_URL` to target
another local server. Seeding skips when any receipt already exists, so reruns
do not add duplicates. Seeding does not upload images or call OpenAI.

To process uploaded receipt images, replace the placeholder with a real
`OPENAI_API_KEY` in the ignored `.env` file. Ensure the key has access to the
configured `OPENAI_MODEL` and billing is enabled, then follow the
[CLI setup](../goho-cli/README.md). An OpenAI key is not needed for local receipt
creation, reading, or seeding.

## Verification

Run the repository checks before submitting changes:

```bash
pnpm check
```

## Database changes

Use the shared Postgres layer from `@goho/core`. Keep receipt tables, migrations,
and repository behavior in this server.

### Receipt schema

`receipts` holds only receipt data: store, receipt date, category, subtotal, tax,
total, currency, and creation time. `receipt_items` stores ordered item
names and amounts, linked to a receipt. Dates use `date`, creation times use
`timestamptz`, and amounts use `numeric` without two-decimal rounding. Currency
applies to every item and total and defaults to CAD. The migration backfills
existing null currencies and makes the column non-null. Both API creation and
GPT extraction require an explicit three-letter currency code; null and missing
currency are rejected. Extraction preserves the receipt's currency and uses CAD
when the receipt gives no clues identifying another currency. Extraction version 2
records this required field. See [receipt creation](./README.md#create-a-receipt).

`receipt_uploads` links each processed upload to its receipt and records the
extraction version and validated extraction JSON once the upload succeeds.

Decimal strings preserve the finite numeric values supplied by the parser; they
cannot recover precision already lost upstream.

The repository inserts a receipt and all its items in one transaction; inside a
caller's transaction the insert joins it as a savepoint. Upload processing
inserts the receipt and marks the upload succeeded in one transaction, so the
upload's status transition is what prevents duplicate receipts from redelivered
jobs.
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
are separate commands when run directly. The root `pnpm server:dev` command
runs them through Turbo before starting the server. Direct package `start` and
`dev` commands do not run migrations. The [systemd unit](#systemd-service)
runs `db:migrate` automatically before launching the server on each start or
restart. For other deployments, run it explicitly before starting the new
server version. CI does not migrate deployment databases.

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

## Host deployment

For systemd and Docker Compose deployment, see the
[deployment guide](../../infra/deployment/README.md). Local development uses the
[setup above](#local-setup).
