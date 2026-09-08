# Contributing to @goho/goho-cli

Follow the root [CONTRIBUTING.md](../../CONTRIBUTING.md).
Complete the root [development setup](../../CONTRIBUTING.md#development-setup),
then follow the [CLI setup](./README.md#setup).
The [server setup](../goho-server/CONTRIBUTING.md) owns provider credentials and
receipt workflow validation.

Use `pnpm --filter @goho/goho-cli dev` for watch mode and `pnpm check` for verification.
Keep receipt orchestration in the server; the CLI calls the shared client and formats results.
