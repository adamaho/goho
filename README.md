# Goho

Goho is organized as a pnpm and Turborepo workspace.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow,
verification commands, workspace conventions, and commit guidelines.

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to upload images and track their processing status. The shared API contract lives in
[packages/goho-api](packages/goho-api/README.md), and the derived typed client lives in
[clients/goho-server](clients/goho-server/README.md).
