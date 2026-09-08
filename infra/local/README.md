# Local infrastructure

Start development PostgreSQL and wait until it is ready:

```bash
pnpm --filter @goho/infra-local infra:up
```

The development URL is `postgresql://goho:goho@127.0.0.1:5432/goho`.
Set `GOHO_POSTGRES_PORT` to change the host port. Data lives in a named volume;
`infra:down` preserves it and `infra:reset` deliberately deletes it.
Postgres 18 mounts its data volume at `/var/lib/postgresql`. If a previous
container contains data, back it up before changing or recreating that container.

## Integration tests

Start a separate disposable PostgreSQL instance:

```bash
pnpm --filter @goho/infra-local infra:test:up
TEST_DATABASE_URL=postgresql://goho_test:goho_test@127.0.0.1:5433/goho_test pnpm turbo run test:integration
pnpm --filter @goho/infra-local infra:test:down
```

Set `GOHO_TEST_POSTGRES_PORT` to change the test port and update the URL to match.
Test data uses temporary storage and is lost when the container stops. The test
instance does not mount or reset development data. Use only a dedicated test
URL: integration tests may create and remove tables or schemas.

Each Compose project can be named separately with `COMPOSE_PROJECT_NAME` for
concurrent checkouts (also give each instance a distinct host port).

CI provisions the same Postgres image through a GitHub Actions service and
supplies `TEST_DATABASE_URL`. Test tasks never start local Compose themselves.
