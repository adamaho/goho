# @goho/goho-cli

Calls the Goho server to upload, inspect, list, patch, and delete receipts and books. OpenAI credentials
belong only to the [server](../goho-server/README.md).

## Setup

From the repository root after the [development setup](../../CONTRIBUTING.md#development-setup):

```bash
cp programs/goho-cli/.env.example programs/goho-cli/.env
```

`GOHO_SERVER_URL` defaults to `http://127.0.0.1:3000`.
Start the server before invoking the CLI.

## List receipts

```bash
pnpm --filter @goho/goho-cli start receipts list
```

The command prints a JSON array containing every persisted receipt and its
ordered items, newest first. An empty database prints `[]`.

## Upload a receipt

```bash
pnpm --filter @goho/goho-cli start receipts upload <path>
```

The command accepts one JPEG, PNG, or WebP image and immediately prints the
queued upload resource as JSON. Keep its UUID to check processing status.

## Check upload status

```bash
pnpm --filter @goho/goho-cli start receipts status <upload-id>
```

The command prints `queued`, `processing`, `succeeded`, or `failed`. A successful
upload includes the resulting receipt ID; a failed upload includes a stable
failure code.

## View a receipt

```bash
pnpm --filter @goho/goho-cli start receipts view <positive-integer-receipt-id>
```

The command prints the complete receipt as JSON. A malformed ID or a valid ID
that does not exist exits nonzero; a missing receipt prints a specific message.

## Patch a receipt

```bash
pnpm --filter @goho/goho-cli start receipts patch 42 --store-name "Corner Store" --receipt-date 2026-10-17
```

Supply at least one of `--store-name` or `--receipt-date`. Only
supplied fields change. Names are trimmed and must be nonblank; dates must be
real calendar dates in `YYYY-MM-DD` format. The command prints the complete saved
receipt as JSON. Amounts, currency, and items cannot be changed with this command.

## Patch a receipt item

```bash
pnpm --filter @goho/goho-cli start receipts patch-item 42 7 --name "Granny Smith apples" --category "Groceries"
```

Use the receipt ID and the item's persisted `id` from `receipts view` or
`receipts list`, not its `position`. Supply `--name`, `--category`, or both; values
are trimmed and must be nonblank. Categories are saved in lowercase, and an
unfamiliar name adds a new category. The command prints the saved item as JSON;
its ID, amount, and position stay unchanged.

Both patch commands reject invalid arguments before sending a request and exit
nonzero for rejected corrections, missing resources, or server failures.

## Delete a receipt

```bash
pnpm --filter @goho/goho-cli start receipts delete <positive-integer-receipt-id>
```

The command permanently removes the receipt, its items, and any scanned image,
then prints `Deleted receipt <id>.` There is no confirmation prompt. A missing
receipt exits nonzero with a specific message.

## List books

```bash
pnpm --filter @goho/goho-cli start books list
```

The command prints a JSON array containing every persisted book, newest first.
An empty database prints `[]`.

## Upload a book cover

```bash
pnpm --filter @goho/goho-cli start books upload <path>
```

The command accepts one JPEG, PNG, or WebP cover image and immediately prints the
queued upload resource as JSON. Keep its UUID to check processing status.

## Check book upload status

```bash
pnpm --filter @goho/goho-cli start books status <upload-id>
```

The command prints `queued`, `processing`, `succeeded`, or `failed`. A successful
upload includes the saved or matched book ID; a failed upload includes a stable
failure code.

## View a book

```bash
pnpm --filter @goho/goho-cli start books view <positive-integer-book-id>
```

The command prints the complete book as JSON. A malformed ID or a valid ID that
does not exist exits nonzero; a missing book prints a specific message.

## Patch a book

```bash
pnpm --filter @goho/goho-cli start books patch 12 --title "The Hobbit" --reading-level "Grade 5"
```

Supply at least one of `--title`, `--author`, `--category`, or `--reading-level`.
Only supplied fields change, and values are trimmed and must be nonblank.
Categories are saved in lowercase, and an unfamiliar name adds a new category.
The command prints the complete saved book as JSON. A title and author that match
another book exit nonzero; books are never merged.

## Delete a book

```bash
pnpm --filter @goho/goho-cli start books delete <positive-integer-book-id>
```

The command permanently removes the book, its successful cover scans, and their
images, then prints `Deleted book <id>.` There is no confirmation prompt. A missing
book exits nonzero with a specific message.

Run `pnpm --filter @goho/goho-cli start --help` for command help.
