# Contributing

Keep changes to Goho small, explicit, and easy to review.

## Prerequisites

Install these before working in the repo:

- [Node.js](https://nodejs.org/en/download) 24, matching `engines.node` in `package.json`
- [pnpm](https://pnpm.io/installation) at the version pinned in `packageManager`
- [Docker with Compose](https://docs.docker.com/get-docker/) when using local services

## Development Setup

Use the Node.js and pnpm versions declared in `package.json`. Existing tools
in a local machine or sandbox are fine when they meet those requirements.
Install pnpm directly using its [installation instructions](https://pnpm.io/installation);
use the pinned version and do not use Corepack.

Install dependencies:

```bash
pnpm install
```

Start local infrastructure when a package needs shared runtime services:

```bash
pnpm --filter=@goho/infra-local run infra:up
```

For the Goho server, `pnpm server:dev` starts local PostgreSQL, applies
migrations, and runs the server in watch mode. See the
[server setup](programs/goho-server/CONTRIBUTING.md#local-setup).

## Agent-first setup

From the repository root, copy this prompt into a coding agent running on your
machine:

```text
Set up this checkout for local Goho server development. Read CONTRIBUTING.md,
programs/goho-server/CONTRIBUTING.md, and package.json first. Check the declared
Node.js and pnpm versions and whether Docker Compose works for my user. Reuse
compatible installations; install missing tools directly without Corepack.
Run pnpm install. Copy programs/goho-server/.env.example to
programs/goho-server/.env only if the destination does not exist. Keep the
example's OpenAI placeholder for local receipt APIs and seeding; a real key is
only needed to process uploaded images. Never print, overwrite, or commit
secrets. Run pnpm server:dev and wait for the server to be ready. In another
terminal,
run pnpm --filter @goho/goho-server db:seed. Run pnpm check. Report what worked
and any steps that still need my attention.
```

The server setup runs PostgreSQL and migrations before starting watch mode. The
seed command runs after the server is ready and can be repeated without creating
duplicate receipts.

## Verification

Run the full local verification command before opening a PR or committing a
completed change:

```bash
pnpm check
```

This runs the repository format and OpenAPI contract checks first, then lets
Turbo run package-level lint, TypeScript, and unit-test tasks where defined.

Useful focused commands:

- `pnpm fmt` formats the repository
- `pnpm fmt:check` checks formatting without writing changes
- `pnpm lint` runs package lint tasks through Turbo
- `pnpm test:unit` runs package unit test tasks through Turbo
- `pnpm tsc` runs package TypeScript tasks through Turbo

## Workspace Layout

Use the top-level workspace directories consistently:

- `programs/*` contains all runnable and deployable applications, APIs, workers,
  scheduled jobs, and other executables
- `packages/*` contains shared features, reusable libraries, clients, and other
  importable code
- `tools/*` contains internal tooling packages
- `infra/*` contains infrastructure helpers

Programs should remain thin deployable entry points. Code used by only one
program can remain local to it. Shared capabilities, or code that needs a public
API and dependency boundary, belong in `packages/*`.

Package names should use the `@goho` npm scope. Packages under `packages/*` do
not require category-based names. Each directory directly under `packages/*`
must match its `package.json` name after removing the npm scope. For example,
`@goho/billing` belongs in `packages/billing`, while `@goho/core` belongs in
`packages/core`.

Shared API contracts live in `packages/goho-api` and the generated client lives
in `clients/goho-server`. Receipt orchestration stays in `programs/goho-server`;
shared AI integration stays in `packages/core`.

## Package Imports

Define package-local aliases in `package.json` using Node's `imports` field:

```json
"imports": {
  "#src/*": "./src/*",
  "#test/*": "./test/*"
}
```

Include each alias when its directory exists, including in tooling packages.
Use these aliases for imports that would otherwise traverse parent directories,
such as `#src/receipts/repository.ts`. Keep explicit file extensions; imports
within the same directory can use `./`. Import other workspace packages through
their public package names and exports.

Node, TypeScript's NodeNext resolution, and the test runner use the package
mapping directly; do not add TypeScript-only `paths` aliases.

## Documentation Comments

Use JSDoc where it helps a consumer understand an exported API, or where code
has non-obvious behavior, invariants, side effects, failure semantics, or
lifecycle requirements. Private helpers with clear names and types do not need
documentation comments.

Comments should explain intent and tradeoffs rather than restating the code.
Do not add `@param` or `@returns` tags when they only repeat TypeScript names
and types. Tests, fixtures, and straightforward transformations generally do
not need JSDoc.

## Dependency Management

Prefer centralizing shared dependency versions in `pnpm-workspace.yaml` using
the catalog. This keeps package manifests small and makes upgrades easier to
review.

## Commit Messages

Prefer using the configured coding agent commit workflow when creating commits.
The agent formats the repo, stages the intended changes, writes a compliant
commit message, and pushes to the current branch.

Commit subjects must use scoped Conventional Commit format:

```text
<type>(<scope>): <description>
```

Allowed types:

- `feat`
- `fix`
- `docs`
- `chore`
- `refactor`
- `test`

Use the affected package name without the npm scope as the commit scope. For
root-only project changes, use `goho`.

Examples:

```text
chore(goho): add contributor documentation
feat(web): add account settings page
fix(api): validate missing request body
```
