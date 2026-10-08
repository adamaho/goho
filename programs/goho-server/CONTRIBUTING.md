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

- `GOHO_SERVER_HOST`: bind address; defaults to `127.0.0.1`. The container image sets `0.0.0.0`.
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
when the receipt gives no clues identifying another currency. Extraction version 1
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
`dev` commands do not run migrations. The container entry point applies
migrations before launching the server on each start or restart. For other
deployments, run migrations explicitly before starting the new server version.

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
The container entry point applies migrations before launching the server. Direct launches
with `start` or `dev` require the separate migration command first.

## Deployment

The server owns its Dockerfile, Compose stack and build/deploy scripts. GitHub
Actions identifies affected programs with Turbo on pushes to `dev` and deploys
them in parallel matrix jobs. A manual run deploys all programs. The workflow
currently provides Docker, GHCR and Tailscale access to one host.

- `pnpm --filter @goho/goho-server build` builds and loads the commit-tagged image
  into the local Docker daemon. It needs Docker Buildx, but no deployment credentials.
- `pnpm turbo run deploy --filter=@goho/goho-server` builds first, publishes that
  image to GHCR, copies [`compose.yml`](./compose.yml) to `/opt/goho/goho-server/`,
  and runs [`scripts/remote-deploy.sh`](./scripts/remote-deploy.sh) on the host.
  The remote script pulls the image and waits for the Compose services to be healthy.

Use Turbo for deployment: calling the package's `deploy` script directly assumes
its image is already built. Build and deploy caching is disabled in the root
`turbo.json`, since Docker images and remote changes are outside Turbo's file cache.
Buildx can reuse its local layer cache; this setup does not export a registry build cache.
The PR build job builds the image without publishing or deploying it.

The image defaults to `ghcr.io/adamaho/goho-server:<git-commit>`. CI supplies
`GOHO_IMAGE_REGISTRY` and `GITHUB_SHA`; deployment also requires `GOHO_DEPLOY_HOST`
and registry authentication on both runner and host. The workflow handles those logins
and passes `GOHO_DEPLOY_DOCKER_CONFIG` to select the job's temporary host credentials.
Manual deployments use the host user's default Docker configuration when it is unset.

The Compose stack includes this application's Postgres database. Its existing
project and volume names are preserved so deployment reuses installed data.
Host setup is described below.

### What stays out of the public repository

This repository is public, so the setup keeps every private value on the server
or in GitHub's encrypted secrets:

- Application secrets, such as the OpenAI key and the Postgres password, live only in
  `/etc/goho/*.env` on the server. [`.dockerignore`](../../.dockerignore) keeps
  every `.env` file out of image builds.
- The server's tailnet name lives in the `production` environment's secrets, and
  GitHub masks it in logs. The workflow never prints it.
- No Tailscale key or SSH key exists anywhere. CI proves its identity with a
  short-lived GitHub OIDC token that Tailscale only accepts from the
  `production` environment of this repository.
- The registry login on the server uses the job's own `GITHUB_TOKEN`, which
  expires when the job ends. Each matrix job uses a separate temporary Docker
  configuration on the host and removes it afterwards, so concurrent jobs cannot
  overwrite or remove one another's registry credentials.
- The workflow never runs for pull requests, so code from a fork cannot reach
  the secrets or the tailnet.
- The API port listens only on `127.0.0.1`. Tailscale Serve is the only way in.

Images contain only open-source code from this repository, nothing private.

### One-time setup

#### 1. Tailscale access policy

In the [Tailscale admin console](https://login.tailscale.com/admin/acls), add
the tags, access grants and SSH rule to the policy file. Replace the emails with
your Tailscale logins:

```jsonc
{
  "tagOwners": {
    "tag:goho-server": ["autogroup:admin"],
    "tag:goho-ci": ["autogroup:admin"],
  },
  "grants": [
    // The phones and laptops of the two people who use Goho.
    {
      "src": ["you@example.com", "bryanne@example.com"],
      "dst": ["tag:goho-server"],
      "ip": ["443"],
    },
    // CI may only open SSH to the Goho server.
    { "src": ["tag:goho-ci"], "dst": ["tag:goho-server"], "ip": ["22"] },
  ],
  "ssh": [
    // "accept", not "check": CI cannot complete a browser re-authentication.
    { "action": "accept", "src": ["tag:goho-ci"], "dst": ["tag:goho-server"], "users": ["goho"] },
  ],
}
```

If the policy still has the default allow-all rule, these grants add nothing until
you remove it. Invite Bryanne to the tailnet from **Users**; the free plan covers
up to six users.

Under **DNS**, enable MagicDNS and HTTPS certificates.

#### 2. Server

Install Docker Engine with the Compose plugin on the host first. Check that
`docker compose version` succeeds and the Docker daemon is running. Then
install Tailscale and join it with the server tag and
Tailscale SSH:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --advertise-tags=tag:goho-server
```

Create the deploy user and give it the deployment directory and configuration.
Membership of the `docker` group is equivalent to root on this machine, so the
SSH rule above limits who can log in as `goho`.

```bash
sudo useradd --system --create-home --shell /bin/bash --groups docker goho
sudo install -d -o goho -g goho -m 0750 /opt/goho /opt/goho/goho-server
sudo install -d -o goho -g goho -m 0700 /var/lib/goho/receipt-uploads
```

Create `/etc/goho/server.env` from the production
[`.env.example`](../../infra/deployment/goho-server/.env.example), and create
`/etc/goho/postgres.env` containing `POSTGRES_PASSWORD=` followed by a URL-safe
password (for example, generate one with `openssl rand -hex 32`). Keep an existing
database's password when updating its configuration. Set the OpenAI credentials
in `server.env`. Compose sets `DATABASE_URL`, the port, the bind address and the
uploads directory itself.

Create the configuration directory before placing the files there:

```bash
sudo install -d -o root -g goho -m 0750 /etc/goho
```

Once both files exist, restrict access and link the database configuration for Compose:

```bash
sudo chown root:goho /etc/goho/server.env /etc/goho/postgres.env
sudo chmod 0640 /etc/goho/server.env /etc/goho/postgres.env
sudo ln -s /etc/goho/postgres.env /opt/goho/goho-server/.env
```

The link lets Compose read the Postgres password without copying it.

Publish the API to the tailnet over HTTPS:

```bash
sudo tailscale serve --bg 13000
tailscale serve status
```

The status shows the server's address, such as `https://goho.<tailnet>.ts.net`.

#### 3. Tailscale credential for CI

On the [Trust credentials](https://login.tailscale.com/admin/settings/trust-credentials)
page, create an **OpenID Connect** credential:

- Issuer: **GitHub Actions**
- Subject: `repo:adamaho/goho:environment:production`
- Scope: `auth_keys` (write), with tag `tag:goho-ci`

Copy the **Client ID** and **Audience** it shows.

#### 4. GitHub environment

In the repository's **Settings → Environments**, create `production`:

- **Deployment branches and tags**: selected branches, `dev` only.
- **Environment secrets**:
  - `TS_OAUTH_CLIENT_ID`: the credential's Client ID
  - `TS_AUDIENCE`: the credential's Audience
  - `GOHO_DEPLOY_HOST`: the server's MagicDNS name, such as `goho` or `goho.<tailnet>.ts.net`

### First deployment

After completing host and GitHub setup, open **Actions → deploy → Run workflow**
on `dev`. Check `https://<server address>/health` from a device on the tailnet.

### Day to day

- **Deploy:** merge to `dev`. Edits to the workflow file alone change no
  program, so run the workflow by hand to redeploy after them.
- **Roll back:** re-run the `deploy` workflow run of an earlier commit. It
  rebuilds and deploys that commit.
- **Logs:** `sudo docker logs --follow goho-deployment-server-1`
- **Backups:** Compose does not back anything up. Keep copies of the `pg_dump`
  output and `/var/lib/goho/receipt-uploads` off the machine. For example:

  ```bash
  sudo docker exec goho-deployment-postgres-1 pg_dump -U goho -d goho > goho.sql
  ```

### Android app

Point the release build at the Tailscale Serve address without committing it.
Add it to `~/.gradle/gradle.properties` on the machine that builds the app:

```properties
gohoServerUrl=https://goho.<tailnet>.ts.net
```

Both phones need the Tailscale app signed in to the tailnet.
