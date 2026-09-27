# Contributing to @goho/goho-mcp

Follow the repository-wide [CONTRIBUTING.md](../../CONTRIBUTING.md).

To try `list_receipts` with local data, follow the [Goho server setup](../goho-server/CONTRIBUTING.md#local-setup). In one terminal, run `pnpm server:dev`; after it is ready, run `pnpm --filter @goho/goho-server db:seed` in another. Then launch this program through an MCP client and call `list_receipts`.

Run `pnpm check` from the repository root before submitting changes. Keep stdout reserved for MCP protocol messages; write diagnostics to stderr.
