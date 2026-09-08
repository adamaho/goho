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

Development, local tests, and CI use the same Compose definition and `infra:up`
command. Use a separate project name and port for local tests so they have their
own container and volume:

```bash
(
  export COMPOSE_PROJECT_NAME=goho-test
  export GOHO_POSTGRES_PORT=5433
  export TEST_DATABASE_URL=postgresql://goho:goho@127.0.0.1:5433/goho
  trap 'pnpm --filter @goho/infra-local infra:reset' EXIT
  pnpm --filter @goho/infra-local infra:up && pnpm turbo run test:integration
)
```

The subshell keeps these settings out of subsequent development commands.
Cleanup removes only this project's container and volume. Use a different project
name and host port for each concurrent checkout, and update the URL to match.

CI runs the same infrastructure command with `COMPOSE_PROJECT_NAME=goho-ci` and
removes its volume after testing. Integration tasks connect to `TEST_DATABASE_URL`;
they do not provision infrastructure themselves. Receipt repository tests create
and drop temporary schemas and apply the real migrations within each schema.
