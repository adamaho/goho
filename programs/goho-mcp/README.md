# @goho/goho-mcp

Goho receipts, books, and recipes are small, structured records that give an MCP
client a useful read and write workflow. This local Streamable HTTP server exposes
receipt and book lookup, creation, correction, and deletion, saved recipe
lookup, creation, and deletion, recipe uploads from web page URLs, and status
checks and cleanup for receipt and book cover uploads made elsewhere, and saved
receipt, book, and recipe images, through
the existing Goho HTTP API, so it can be tested without hosting or an OpenAI key.

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

Start programs/goho-mcp with pnpm in a third terminal and keep it running.
Connect my MCP client to http://127.0.0.1:3001/mcp using Streamable HTTP.
Reload the client if needed.

Call list_receipts, get_receipt with a returned ID, and create_receipt with
fictional data. Read the created receipt to verify it. Run pnpm check and report
what worked. Only seed and test against the local dev API, never another Goho
server.
```

## Manual setup

You need Node.js 26, pnpm 12.18.0, and Docker with Compose. See the root
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

This creates four fictional receipts, five books, and three recipes through the
API. Receipts are skipped when any receipt already exists, books are matched by
title and author, and a recipe is skipped when a saved recipe has exactly its
title, so running it again does not duplicate any of them.

## Start the MCP server

In a third terminal at the repository root, start the MCP server and keep it
running:

```bash
pnpm --filter @goho/goho-mcp start
```

Use `dev` instead of `start` to restart on source changes. The server logs its
address on startup and serves:

- `POST /mcp`, the Streamable HTTP MCP endpoint. It supports MCP protocol
  revisions `2025-11-25` and `2025-06-18`.
- `GET /health`, which returns HTTP 200 with `{"data":{"status":"ok"}}` while
  the MCP server is running. It does not check the Goho API.

Configure it with these environment variables:

| Variable          | Default                 | Purpose                                         |
| ----------------- | ----------------------- | ----------------------------------------------- |
| `GOHO_MCP_HOST`   | `127.0.0.1`             | Interface to listen on                          |
| `GOHO_MCP_PORT`   | `3001`                  | Port to listen on, from 0 to 65535; 0 picks one |
| `GOHO_SERVER_URL` | `http://127.0.0.1:3000` | Goho API the tools call                         |

The endpoint has no authentication, so anyone who can reach it can read, change,
and delete receipts, books, and recipes, and make the Goho API fetch any
recipe page URL. The loopback default keeps it on your
machine. Only bind another interface on a trusted network, such as a tailnet
restricted to your devices. The server rejects requests from browser origins,
but that is not access control: other clients can still call it.

## Connect an MCP client

Register the running server with Codex CLI:

```bash
codex mcp add goho --url http://127.0.0.1:3001/mcp
```

Or register it with Claude Code:

```bash
claude mcp add --transport http goho http://127.0.0.1:3001/mcp
```

Start a new session in either client and ask, "List my Goho receipts." Keep the
Goho API and the MCP server running while using the tools.

## Deploy to the tailnet

Merging a change to this program or its workspace dependencies into `dev`
deploys it automatically through the existing `deploy` workflow. No extra workflow
dispatch is needed. The workflow pushes `ghcr.io/<owner>/goho-mcp:<commit-sha>`
and the `dev` tag, copies `compose.yml` to `/opt/goho/goho-mcp`, and waits up to
180 seconds for the container to report healthy.

It reuses the existing `production` deploy user, its Docker access, the CI
secrets, and the shared `goho` network. The stack has no env file, volumes, or
database or OpenAI credentials.

| Setting           | Production value                                                  |
| ----------------- | ----------------------------------------------------------------- |
| Compose service   | `mcp` in project `goho-mcp`                                       |
| `GOHO_MCP_HOST`   | `0.0.0.0` inside the container                                    |
| `GOHO_MCP_PORT`   | `13001`                                                           |
| Host binding      | `127.0.0.1:13001`, so only the host can reach it directly         |
| `GOHO_SERVER_URL` | `http://server:13000`, the `server` service on the `goho` network |

The health check only shows that the MCP server is running. A successful deploy
does not prove the tools can reach the Goho API; if they can't, tool calls return
an error.

### Publish it with Tailscale Serve

Deploying does not change Tailscale, so the endpoint stays host-only until you
publish it. On the Goho host, check the current routes, then add this one as a
user allowed to change Serve configuration:

```bash
tailscale serve status
tailscale serve --bg --https=443 --set-path /mcp http://127.0.0.1:13001/mcp
```

This adds `/mcp` alongside the existing routes on port 443, leaving them
unchanged. Only `/mcp` is published; `/health` is not.

To roll back, remove only this route. Do not use `tailscale serve reset`, which
removes every route:

```bash
tailscale serve --https=443 --set-path /mcp off
```

The endpoint has no authentication, so your tailnet access rules are its only
protection. Any device or user allowed to reach this host on port 443 can read,
change, and delete receipts, books, and recipes. Check that your Tailscale grants
limit port 443 to the clients you trust before publishing; this repository does
not configure them. Do not expose this route with Tailscale Funnel.

### Connect OpenCode

Add the server to `~/.config/opencode/opencode.json` on a device allowed to reach
it, using the host's MagicDNS name:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "goho": {
        "type": "remote",
        "url": "https://<goho-host>.<tailnet>.ts.net/mcp",
        "oauth": false,
      },
    },
  },
}
```

`oauth: false` is there because this server has no OAuth to sign in to and relies
on private tailnet access instead. Check the connection with:

```bash
opencode mcp list
```

## Try the tools

- `list_receipts` returns receipts, newest first, with their items. It takes no
  arguments. After seeding a fresh database, it returns four receipts.
- `get_receipt` takes a positive integer `receipt_id`. Use an ID returned by
  `list_receipts` to inspect its items.
- `create_receipt` saves supplied receipt details and items. Each call saves a
  new receipt. Ask your client to create a fictional receipt
  for Example Store on 2026-09-13, with USD subtotal $10.25, tax $0.75,
  total $11.00, and one Apple item for $10.25 in the Groceries category.
  Then call `get_receipt` with the returned ID.
- `delete_receipt` takes a positive integer `receipt_id` and permanently
  removes that receipt, its items, and any scanned image. It returns the deleted
  ID. Try it on the receipt you just created, then confirm `get_receipt` reports
  it as not found.
- `patch_receipt` takes a string `receipt_id` and a `changes` object containing
  at least one of `storeName` or `receiptDate` (YYYY-MM-DD). For example:
  `{"receipt_id":"42","changes":{"storeName":"Corner Store"}}`.
  It returns the complete saved receipt. Omitted fields stay unchanged;
  amounts, currency, and items cannot be patched.
- `patch_receipt_item` takes string `receipt_id` and `item_id` values and a
  `changes` object with a nonblank `name`, `category`, or both. Use an item ID
  returned by `get_receipt` or `list_receipts`, for example:
  `{"receipt_id":"42","item_id":"7","changes":{"category":"Household"}}`.
  It returns the saved item with its ID, position, name, amount, and category.
  Categories are saved in lowercase, and an unfamiliar name adds a new one.
  Both patch tools trim values and reject unsupported fields.
- `list_books` returns books, newest first. It takes an optional `search`
  string that matches title or author, ignoring case. After seeding a fresh
  database, it returns five books.
- `get_book` takes a string `book_id`. Use an ID returned by `list_books`.
- `create_book` takes `title`, `category`, and optional `author` and
  `readingLevel`; leave out the author when it isn't known. If a saved book already has that title and author, ignoring
  case and extra spaces, it returns that book unchanged instead of adding one.
- `delete_book` takes a string `book_id` and permanently removes that book and
  its cover scans. Its category stays. It returns the deleted ID.
- `patch_book` takes a string `book_id` and a `changes` object containing at
  least one of `title`, `author`, `category`, or `readingLevel`, for example:
  `{"book_id":"12","changes":{"readingLevel":"Grade 5"}}`. Omitted fields stay
  unchanged; null and blank values are rejected. It returns the complete saved book. A title and
  author matching another saved book is rejected; books are never merged.

### Recipes

These tools work with saved recipes. They can't edit a recipe or change its
photo; to read the photo, see [Saved images](#saved-images), and to import a
recipe from a web page, see [Recipe uploads](#recipe-uploads).
Recipe IDs are strings, such as `"9007199254740993"`, so large IDs are never
rounded.

- `list_recipes` returns recipe headlines by title A to Z, ignoring case, then
  newest first. It takes no arguments. Each headline has the ID, title, source,
  total time, photo flag, and timestamps, but no ingredients, steps, or yield.
  After seeding a fresh database, it returns three recipes.
- `get_recipe` takes a string `recipe_id` and returns the complete recipe with
  its ingredients, steps, and yield.
- `create_recipe` saves a recipe with no source or photo. Each call saves a new
  recipe, even when one already has that title. It takes a `title`, at least one
  ingredient, and at least one step. Leave out `yield` and `totalTimeSeconds`,
  or send `null`, when they aren't known. Quantities are exact fractions, ranges,
  or text; exact and range quantities need a unit, and text quantities use
  `null`. A step mark can point at an ingredient by its `id`. For example:

  ```json
  {
    "title": "Example Pancakes",
    "ingredients": [
      {
        "id": "flour",
        "name": "all-purpose flour",
        "quantity": { "kind": "exact", "value": { "numerator": 3, "denominator": 2 } },
        "unit": "cup"
      }
    ],
    "steps": [
      {
        "segments": [
          { "kind": "text", "text": "Whisk " },
          {
            "kind": "mark",
            "content": {
              "kind": "ingredient",
              "ingredientId": "flour",
              "portion": { "numerator": 1, "denominator": 1 }
            }
          },
          { "kind": "text", "text": " with water." }
        ]
      }
    ]
  }
  ```

  It returns the saved recipe with its new ID. Unknown fields, such as `source`,
  are rejected.

- `delete_recipe` takes a string `recipe_id` and permanently removes that
  recipe, every import linked to it, and its photo. Its page can then be
  imported fresh. It returns the deleted ID.

### Recipe uploads

A recipe upload asks the Goho API to import a recipe from a web page. The API
fetches and extracts the page later, so an upload is a record you check on, not
a recipe. Upload IDs are version 4 UUIDs, such as
`"7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d"`; they are not recipe IDs.

1. `create_recipe_upload` takes a `source` with the page URL and returns the new
   upload right away with status `queued`. For example:
   `{"source":{"kind":"url","url":"https://example.com/recipes/pancakes"}}`.
   The URL must be an absolute http or https URL without a username or password,
   up to 2048 UTF-8 bytes. It is trimmed, but otherwise sent as written; the
   API decides whether the page can be fetched. Unknown fields are rejected.
2. `get_recipe_upload` takes a string `upload_id` and returns the upload's
   latest `status`: `queued`, `processing`, `succeeded`, or `failed`. Nothing
   checks on its own; call it again when you want an update.
3. When the status is `succeeded`, call `get_recipe` with its `recipeId` to read
   the saved recipe.

A `failed` upload is a normal result, not a tool error. Its `failureCode`, such
as `page_unavailable` or `no_recipe_found`, says why. To try the page again,
create a new upload; there is no need to delete the failed one first.

- Each `create_recipe_upload` call adds a new upload, even for the same URL. If
  the page is already saved as a recipe, ignoring its fragment, the new upload
  links that recipe without fetching the page again.
- `list_recipe_uploads` returns every upload, newest first, with its status. It
  takes no arguments. Seeding doesn't add any uploads.
- `delete_recipe_upload` takes a string `upload_id` and removes a `failed`
  upload. It returns the deleted ID. Queued, processing, and succeeded uploads
  can't be deleted, and nothing changes. It never deletes a saved recipe; use
  `delete_recipe` for that.

Extracting a new page uses the Goho API's OpenAI model, so with the placeholder
key from `.env.example`, expect uploads of new pages to fail.

### Receipt and book uploads

Receipt images and book cover scans are uploaded elsewhere, such as the Goho
app. These tools check on those uploads and clear away failed ones; they can't
create an upload or send an image from disk. Upload IDs are version 4 UUIDs,
such as `{"upload_id":"3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b"}`; they are not the
string IDs of saved receipts and books.

- `list_receipt_uploads` and `list_book_uploads` return every upload of that
  kind, newest first, with its file name, image type, and `status`: `queued`,
  `processing`, `succeeded`, or `failed`. They take no arguments.
- `get_receipt_upload` and `get_book_upload` take a string `upload_id` and
  return that upload's latest status. Nothing checks on its own; call again
  when you want an update. When the status is `succeeded`, pass its `receiptId`
  to `get_receipt` or its `bookId` to `get_book`. Several cover scans can land
  on the same book.
- `delete_receipt_upload` and `delete_book_upload` take a string `upload_id`
  and remove a `failed` upload and its stored image. They return the deleted
  ID. The Goho API decides what can be deleted: queued, processing, and
  succeeded uploads are refused, and nothing changes. They never delete a saved
  receipt or book; use `delete_receipt` or `delete_book` for that, which also
  removes its scans.

A `failed` upload is a normal result, not a tool error. Its `failureCode`, such
as `processing_failed`, says why.

### Saved images

These tools return the image on file for a saved receipt, book, or recipe as
native MCP image content: one `image` block with base64 `data` and its
`mimeType`, `image/jpeg`, `image/png`, or `image/webp`, and no JSON copy. They
take the same string ID as `get_receipt`, `get_book`, or `get_recipe`, not an
upload ID, and they can't upload, replace, or delete an image.

- `get_receipt_image` takes a `receipt_id`, such as `{"receipt_id":"42"}`, and
  returns the receipt's scanned image. Receipts entered by hand, such as those
  from `create_receipt`, may have none.
- `get_book_image` takes a `book_id`, such as `{"book_id":"12"}`, and returns
  the book's cover: its first successful cover scan. Later scans don't replace
  it, and books entered by hand have none until a scan of them succeeds.
- `get_recipe_image` takes a `recipe_id`, such as `{"recipe_id":"5"}`, and
  returns the photo found when the recipe was imported. Recipes from
  `create_recipe` have none.

The Goho API doesn't say whether the record or only its image is missing, so
both give one message, such as `Book 12 has no cover image, or it was not
found.` Use `get_book` to tell them apart. Seeded records have no images.

## Tool errors

When a tool runs and fails, it returns a tool result with `isError: true` and
one plain text message, with no structured content. Missing records, book
conflicts, uploads that can't be deleted, and input the API rejects get
their own message, such as `Book 12 was not found.`

Arguments that don't match the tool's input schema are rejected before the Goho
API is called, with a message starting `Invalid parameters for tool '<name>':`.
Under protocol `2025-11-25` that message is a tool result with `isError: true`;
under `2025-06-18` it is a JSON-RPC error with code `-32602`.

Any other failure starts with `Could not <action>.`, such as
`Could not get book.`, followed by one of these:

| Cause                                         | Advice                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| No connection to the Goho API                 | The Goho API could not be reached; check GOHO_SERVER_URL and the network.                                       |
| The Goho API failed, with any 5xx status      | The Goho API could not complete the request; try again, and contact the Goho operator if it keeps failing.      |
| A response or request this program cannot use | This MCP server and the Goho API disagree on the request or response; check that their versions are compatible. |
