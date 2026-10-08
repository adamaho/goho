# Infrastructure

`infra/` owns resources and setup shared across programs or environments, such as
local development databases, host provisioning, networking and access policies.
It may contain code that creates or updates those resources; it is not limited
to static configuration.

Programs own their deployable artifacts and release lifecycle: Dockerfiles,
application-specific Compose stacks, build/deploy scripts, migrations and runtime
configuration examples live with the program. A database dedicated to one
program may remain in that program's Compose stack. A database shared by several
programs should have its own infrastructure lifecycle.

- [`local/`](./local/README.md) provides development and integration-test Postgres.
- [`postgres/`](./postgres/README.md) is the production Postgres server that
  Goho programs share. It deploys through the same workflow as programs.
- [`deployment/`](./deployment/README.md) retains the production server
  environment example at its established path.
- Current server deployment lives in
  [`programs/goho-server`](../programs/goho-server/CONTRIBUTING.md#deployment).

## Adding a deployable program

Keep its artifact definition, configuration and scripts under `programs/<name>`.
Expose `build` and `deploy` in its `package.json`. The root `turbo.json` runs
`build` before every `deploy`, keeps both uncached because their results live
outside the repository, and passes the image and deploy variables through. Programs using
the existing Docker/GHCR/Tailscale host can follow the server's implementation;
a different platform also needs suitable CI credentials and setup.

Turbo discovers the program's tasks and workspace dependencies. Do not add an
infra dependency just to make configuration changes trigger deployment. Local
program files already participate in affected-package selection. Extract shared
helpers only when there are real consumers, with an explicit package API.
