# @goho/goho-mcp

A local stdio MCP server for Goho. It offers these tools:

- `hello` returns a greeting.
- `list_receipts` returns saved receipts, newest first, with their items. It takes no arguments.
- `get_receipt` takes a positive integer `receipt_id` and returns that receipt with its items.

Receipt tools require a running Goho server.

Install dependencies from the repository root with `pnpm install`. Configure your MCP client to launch the server over stdio with:

```bash
pnpm --dir /absolute/path/to/goho/programs/goho-mcp start
```

Replace `/absolute/path/to/goho` with your checkout path. Receipt tools connect to `http://127.0.0.1:3000` by default; set `GOHO_SERVER_URL` in the MCP server's environment if your Goho server uses another address. The MCP server stays running while the client is connected and reserves stdout for protocol messages.
