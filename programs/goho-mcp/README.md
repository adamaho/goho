# @goho/goho-mcp

Goho receipts are small, structured records that give an MCP client a useful
read and write workflow. This local stdio server exposes receipt lookup and
creation through the existing Goho HTTP API, so it can be tested without hosting
or an OpenAI key.

## Run locally

You need Node.js 24, pnpm 12.6.0, and Docker with Compose. See the root
[contributing guide](../../CONTRIBUTING.md#prerequisites) for installation links.
From a fresh clone, run these commands at the repository root:

```bash
pnpm install
cp programs/goho-server/.env.example programs/goho-server/.env
pnpm server:dev
```

Leave this terminal running. `server:dev` starts the local PostgreSQL container,
applies migrations, and runs the Goho API at `http://127.0.0.1:3000`. The copied
`.env` includes a placeholder OpenAI key; it is sufficient for receipt tools and
seeding. Keep an existing `.env` rather than overwriting it.

After the API reports that it is listening, seed the **development** database in
a second terminal at the repository root:

```bash
GOHO_SERVER_URL=http://127.0.0.1:3000 pnpm --filter @goho/goho-server db:seed
```

This creates four fictional receipts through the API. The seed command is
idempotent, so running it again does not duplicate them.

## Connect an MCP client

Configure your MCP client to launch this program with the **stdio** transport.
Use your checkout's absolute path in place of `/absolute/path/to/goho`:

```bash
pnpm --dir /absolute/path/to/goho/programs/goho-mcp start
```

For example, from the repository root, Codex CLI users can register it with:

```bash
codex mcp add goho -- "$(command -v pnpm)" --dir "$PWD/programs/goho-mcp" start
```

The MCP server connects to `http://127.0.0.1:3000` by default. If your dev API
uses another address, set `GOHO_SERVER_URL` in the MCP server's environment.
Keep the Goho API running while using the tools. The MCP process stays running
while the client is connected and reserves stdout for protocol messages.

## Try the tools

- `list_receipts` returns receipts, newest first, with their items. It takes no
  arguments. After seeding a fresh database, it returns four receipts.
- `get_receipt` takes a positive integer `receipt_id`. Use an ID returned by
  `list_receipts` to inspect its items.
- `create_receipt` saves supplied receipt details and items, generating an
  idempotency key for the request. Ask your client to create a fictional receipt
  for Example Store on 2026-09-13 in the Groceries category, with USD
  subtotal $10.25, tax $0.75, total $11.00, and one Apple item for $10.25.
  Then call `get_receipt` with the returned ID.

To run the MCP tests from the repository root:

```bash
pnpm --filter @goho/goho-mcp test:unit
```
