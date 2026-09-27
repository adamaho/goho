# Goho

Goho is organized as a pnpm and Turborepo workspace.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for first-time setup, the development
workflow, verification commands, and workspace conventions.

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to upload images and track their processing status. The shared API contract lives in
[packages/goho-api](packages/goho-api/README.md), and the derived typed client lives in
[clients/goho-server](clients/goho-server/README.md).
