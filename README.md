# Goho

Goho is organized as a pnpm and Turborepo workspace.

## Agent-first setup

From the repository root, copy this prompt into a coding agent running on your
machine:

```text
Set up this checkout for local Goho server development. Read README.md,
CONTRIBUTING.md, programs/goho-server/CONTRIBUTING.md, and package.json
first. Check the declared Node.js and pnpm versions and whether Docker Compose
works for my user. Reuse compatible installations; install missing tools
directly without Corepack.
Run pnpm install. Copy programs/goho-server/.env.example to
programs/goho-server/.env only if the destination does not exist. Keep the
example's OpenAI placeholder for local receipt APIs and seeding; a real key is
only needed to process uploaded images. Never print, overwrite, or commit
secrets. Run pnpm server:dev and wait for the server to be ready. In another
terminal, run pnpm --filter @goho/goho-server db:seed. Run pnpm check. Report
what worked and any steps that still need my attention.
```

The server setup runs PostgreSQL and migrations before starting watch mode. The
seed command runs after the server is ready and can be repeated without creating
duplicate receipts.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for first-time setup, the development
workflow, verification commands, and workspace conventions.

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to upload images and track their processing status. The shared API contract lives in
[packages/goho-api](packages/goho-api/README.md), and the derived typed client lives in
[clients/goho-server](clients/goho-server/README.md).
