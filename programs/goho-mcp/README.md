# @goho/goho-mcp

Goho receipts are small, structured records that give an MCP client a useful
read and write workflow. This local stdio server exposes receipt lookup and
creation through the existing Goho HTTP API, so it can be tested without hosting
or an OpenAI key.

## Agent-first setup

From the repository root, copy this prompt into a coding agent running on your
machine:

```text
Set up this checkout so I can test the Goho MCP locally. Read
programs/goho-mcp/README.md, CONTRIBUTING.md,
programs/goho-server/CONTRIBUTING.md, and package.json first.

Check that Node.js, the pinned pnpm version, and Docker Compose are available.
Reuse compatible installations and report any missing prerequisite.

Run pnpm install. If programs/goho-server/.env does not exist, copy it from
programs/goho-server/.env.example. Never print, overwrite, or commit secrets.
The example's placeholder OpenAI key is enough for these receipt tools.

Start pnpm server:dev and wait for the dev API at http://127.0.0.1:3000. Keep
it running. In another terminal, seed only that dev API with:

GOHO_SERVER_URL=http://127.0.0.1:3000 pnpm --filter @goho/goho-server db:seed

Configure my MCP client to launch programs/goho-mcp with pnpm over stdio, using
absolute paths and the dev API. Reload the client if needed.

Call list_receipts, get_receipt with a returned ID, and create_receipt with
fictional data. Read the created receipt to verify it. Run pnpm check and report
what worked. Only seed and test against the local dev API, never another Goho
server.
```

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

From the repository root, register it with Codex CLI:

```bash
codex mcp add goho -- "$(command -v pnpm)" --dir "$PWD/programs/goho-mcp" start
```

Or register it with Claude Code:

```bash
claude mcp add --transport stdio goho -- "$(command -v pnpm)" --dir "$PWD/programs/goho-mcp" start
```

Start a new session in either client and ask, "List my Goho receipts."

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
