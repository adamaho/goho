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
- [`deployment/`](./deployment/README.md) retains the production server
  environment example at its established path.
- Current server deployment lives in
  [`programs/goho-server`](../programs/goho-server/DEPLOYMENT.md).

## Adding a deployable program

Keep its artifact definition, configuration and scripts under `programs/<name>`.
Expose `build` and `deploy` in its `package.json`. Declare the task dependency in
its `turbo.json` so deploy consumes the build output. Disable caching for side
effects and declare any environment variables its tasks require. Programs using
the existing Docker/GHCR/Tailscale host can follow the server's implementation;
a different platform also needs suitable CI credentials and setup.

Turbo discovers the program's tasks and workspace dependencies. Do not add an
infra dependency just to make configuration changes trigger deployment. Local
program files already participate in affected-package selection. Extract shared
helpers only when there are real consumers, with an explicit package API.
