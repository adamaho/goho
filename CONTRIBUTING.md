# Contributing

Keep changes to Goho small, explicit, and easy to review.

## Prerequisites

Install these before working in the repo:

- [Node.js 24](https://nodejs.org/en/download)
- [pnpm 12.3.4](https://pnpm.io/installation)
- [Docker](https://docs.docker.com/get-docker/)

## Development Setup

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Start local infrastructure when a package needs shared runtime services:

```bash
pnpm --filter=@goho/infra-local run infra:up
```

## Verification

Run the full local verification command before opening a PR or committing a
completed change:

```bash
pnpm check
```

This runs the repository format check first, then lets Turbo run package-level
lint and TypeScript tasks in parallel where packages define them.

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

Use exact versions. The workspace config sets `saveExact: true` and
`engineStrict: true`.

Goho applies a strict 24-hour minimum release age to direct and transitive
dependencies and rechecks the policy during frozen installs. This delay reduces
exposure to compromised releases while preserving reproducible installs through
the committed lockfile. The three named `@adamaho` tooling packages are the only
exceptions: they are deliberately first-party releases, and GitHub Packages does
not provide the publication timestamps needed by the strict policy. Keep this
list package-specific rather than excluding the whole scope. Add any other
exception only when a reviewed update cannot wait, prefer a version-specific
entry, explain it in the PR, and remove it after the version is 24 hours old.

Private `@adamaho` dependencies use pnpm's `gh:` registry alias so their source
is recorded in the lockfile. Authenticate to `npm.pkg.github.com` in a user-level
auth file with a classic personal access token that has `read:packages`. Do not
commit credentials or a project `.npmrc`.

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

## Coding Agents

Coding agents should use the Node.js and pnpm versions declared in
`package.json`. Verify their versions before running project commands:

```bash
node --version
pnpm --version
```

Server API contracts and clients live in `clients/<server-name>`. Server-specific
receipt orchestration stays in `programs/goho-server`; shared Google and AI
integrations stay in `packages/core`.
