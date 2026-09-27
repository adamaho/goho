# @goho/goho-mcp

A local stdio MCP server for Goho. It offers these tools:

- `list_receipts` returns saved receipts, newest first, with their items. It takes no arguments.
- `get_receipt` takes a positive integer `receipt_id` and returns that receipt with its items.
- `create_receipt` saves supplied receipt details and items, generating an idempotency key for the request.

Receipt tools require a running Goho server.

Install dependencies from the repository root with `pnpm install`. Configure your MCP client to launch the server over stdio with:

```bash
pnpm --dir /absolute/path/to/goho/programs/goho-mcp start
```

Replace `/absolute/path/to/goho` with your checkout path. Receipt tools connect to `http://127.0.0.1:3000` by default; set `GOHO_SERVER_URL` in the MCP server's environment if your Goho server uses another address. The MCP server stays running while the client is connected and reserves stdout for protocol messages.

To try `create_receipt`, ask your MCP client to create a fictional receipt with a store name, date, category, subtotal, tax, total, currency, and at least one item. For example, use a grocery purchase from Example Store on 2026-09-13 with an Apple item for $10.25, $0.75 tax, and $11.00 total. The tool creates a new receipt for each call; call `get_receipt` with its returned ID to verify it.
