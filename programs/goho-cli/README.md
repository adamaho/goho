# @goho/goho-cli

Calls the Goho server to check its status and to upload, inspect, list, patch, and delete receipts and
books, and to add receipts and books by hand. OpenAI credentials belong only to the [server](../goho-server/README.md).

## Setup

From the repository root after the [development setup](../../CONTRIBUTING.md#development-setup):

```bash
cp programs/goho-cli/.env.example programs/goho-cli/.env
```

`GOHO_SERVER_URL` defaults to `http://127.0.0.1:3000`. It must be an absolute `http` or
`https` URL and may include a base path; an empty or malformed value fails with
`goho:cli:configuration-error` before any request. Help, version, and command-group usage work without it.
Start the server before invoking the CLI.

Upload operations live under `books uploads` and `receipts uploads`, each with
`create`, `list`, `view`, and `delete` subcommands:

| Previous command                    | Replacement (books or receipts)      |
| ----------------------------------- | ------------------------------------ |
| `<group> upload <path>`             | `<group> uploads create <path>`      |
| `<group> uploads`                   | `<group> uploads list`               |
| `<group> status <upload-id>`        | `<group> uploads view <upload-id>`   |
| `<group> delete-upload <upload-id>` | `<group> uploads delete <upload-id>` |

The old forms are no longer supported. `goho status` still checks server health.

## Delete responses

All four delete commands print a JSON confirmation instead of a text message:

```json
{ "deleted": true, "resource": "book", "id": "12" }
```

`resource` is `book`, `receipt`, `book-upload`, or `receipt-upload`, and `id` stays a
string. Failures still exit nonzero and print an error to stderr without a success result.

## Error responses

Every failure prints one problem object to stderr, nothing to stdout, and exits with
code `1`. Scripts should branch on `type`.

A problem from the server is printed with the public members it sent: `type`,
`status`, `title`, and `detail`, `instance`, or declared extensions such as `errors`
when present:

```json
{ "type": "goho:problem:book-not-found", "status": 404, "title": "Book not found" }
```

Failures the CLI detects itself use a `goho:cli:` type, a `title`, and a `detail`,
with no HTTP `status`:

```json
{
  "type": "goho:cli:invalid-input",
  "title": "Invalid command input",
  "detail": "Missing required argument: book-id"
}
```

| Type                           | Meaning                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| `goho:cli:invalid-input`       | Arguments, flags, or local values are invalid; no request was sent    |
| `goho:cli:configuration-error` | `GOHO_SERVER_URL` is empty or not an absolute `http` or `https` URL   |
| `goho:cli:connection-failed`   | The server could not be reached                                       |
| `goho:cli:file-error`          | A local image could not be read or saved, or its extension is unknown |
| `goho:cli:unexpected-response` | The server sent a body or status the API does not declare             |
| `goho:cli:unexpected-failure`  | Anything else; the detail is generic                                  |

Successful JSON output is unchanged. Causes, stacks, and undeclared response members
are never printed. Parse errors do not print help; several share one `detail`, one per
line. Run a command with `--help` for its usage. Interrupting the CLI exits with code
`130` and prints nothing.

## Check server status

```bash
pnpm --filter @goho/goho-cli start status
```

The command prints `{ "status": "ok" }` as JSON when the server is responding. An
unreachable or failing server exits nonzero. It does not check the database or
providers.

## List receipts

```bash
pnpm --filter @goho/goho-cli start receipts list
```

The command prints a JSON array containing every persisted receipt and its
ordered items, newest first. An empty database prints `[]`.

## Upload a receipt

```bash
pnpm --filter @goho/goho-cli start receipts uploads create <path>
```

The command accepts one JPEG, PNG, or WebP image and immediately prints the
queued upload resource as JSON. Keep its UUID to check processing status.

## Check upload status

```bash
pnpm --filter @goho/goho-cli start receipts uploads view <upload-id>
```

The command prints the upload resource as JSON, including its current status:
`queued`, `processing`, `succeeded`, or `failed`. A successful
upload includes the resulting receipt ID; a failed upload includes a stable
failure code.

## List receipt uploads

```bash
pnpm --filter @goho/goho-cli start receipts uploads list
```

The command prints a JSON array containing every receipt upload and its current
status, newest first. No uploads prints `[]`.

## Delete a failed receipt upload

```bash
pnpm --filter @goho/goho-cli start receipts uploads delete <upload-id>
```

The command permanently removes the failed upload and its stored image, then
prints a JSON confirmation with `resource: "receipt-upload"`. There is no confirmation prompt. An upload that
is queued, processing, or succeeded exits nonzero and nothing changes; delete the
receipt to remove a successful scan. A missing upload also exits nonzero.

## View a receipt

```bash
pnpm --filter @goho/goho-cli start receipts view <positive-integer-receipt-id>
```

The command prints the complete receipt as JSON. A malformed ID or a valid ID
that does not exist exits nonzero; a missing receipt prints the server's not-found problem.

## Download a receipt image

```bash
pnpm --filter @goho/goho-cli start receipts image 42
pnpm --filter @goho/goho-cli start receipts image 42 --output scans/receipt.jpg
```

The command saves the receipt's stored scanned image and prints its `path`, `contentType`,
and `sizeBytes` as JSON. Without `--output` the file is named `receipt-<id>` with the
image's extension, in the current directory. `--output` is used exactly as given, so check
`contentType` if its extension matters, and its folder must already exist.

An existing file is overwritten. A missing receipt, or one entered by hand with no
scanned image, exits nonzero. This command only retrieves the stored image; it does not
upload or queue anything for processing.

## Add a receipt

```bash
pnpm --filter @goho/goho-cli start receipts create \
  --store-name "Example Store" \
  --receipt-date 2026-09-13 \
  --subtotal 10.25 --tax 0.75 --total 11.00 \
  --currency USD \
  --item "name=Apples,amount=10.25,category=Groceries" \
  --item "name=Milk\, 2%,amount=4.99,category=Groceries"
```

Every flag is required. Repeat `--item` once per line item, in receipt order; each needs
`name`, `amount`, and `category`, in any order. Inside an item, write a comma as `\,` and
a backslash as `\\`.

Amounts are decimals and are not rounded or checked against the totals. Names are trimmed
and must be nonblank; dates must be real calendar dates in `YYYY-MM-DD` format; `currency`
is three uppercase letters. Categories are saved in lowercase, and an unfamiliar name adds
a new category. The command prints the complete saved receipt as JSON.

Invalid values exit nonzero before sending a request. Every successful call saves a new
receipt, so running the command twice leaves two receipts.

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
then prints a JSON confirmation with `resource: "receipt"`. There is no confirmation prompt. A missing
receipt exits nonzero with the server's not-found problem.

## List books

```bash
pnpm --filter @goho/goho-cli start books list
```

The command prints a JSON array containing every persisted book, newest first.
An empty database prints `[]`.

## Search books

```bash
pnpm --filter @goho/goho-cli start books search "hobbit"
```

Search text is required and must be nonblank. The command prints a JSON array of
books whose title or author contains the text, ignoring case and extra spaces;
no matches prints `[]`. Quote search text that contains spaces.

This replaces `books list --search <text>`; `books list` now always lists every book.

## Upload a book cover

```bash
pnpm --filter @goho/goho-cli start books uploads create <path>
```

The command accepts one JPEG, PNG, or WebP cover image and immediately prints the
queued upload resource as JSON. Keep its UUID to check processing status.

## Check book upload status

```bash
pnpm --filter @goho/goho-cli start books uploads view <upload-id>
```

The command prints the upload resource as JSON, including its current status:
`queued`, `processing`, `succeeded`, or `failed`. A successful
upload includes the saved or matched book ID; a failed upload includes a stable
failure code.

## List book cover uploads

```bash
pnpm --filter @goho/goho-cli start books uploads list
```

The command prints a JSON array containing every book cover upload and its current
status, newest first. No uploads prints `[]`.

## Delete a failed book cover upload

```bash
pnpm --filter @goho/goho-cli start books uploads delete <upload-id>
```

The command permanently removes the failed upload and its stored image, then
prints a JSON confirmation with `resource: "book-upload"`. There is no confirmation prompt. An upload that
is queued, processing, or succeeded exits nonzero and nothing changes; delete the
book to remove a successful scan. A missing upload also exits nonzero.

## View a book

```bash
pnpm --filter @goho/goho-cli start books view <positive-integer-book-id>
```

The command prints the complete book as JSON. A malformed ID or a valid ID that
does not exist exits nonzero; a missing book prints the server's not-found problem.

## Download a book cover

```bash
pnpm --filter @goho/goho-cli start books image 12
pnpm --filter @goho/goho-cli start books image 12 --output covers/hobbit.webp
```

The command saves the book's stored cover image and prints its `path`, `contentType`,
and `sizeBytes` as JSON. Without `--output` the file is named `book-<id>` with the
image's extension, in the current directory. `--output` is used exactly as given, so check
`contentType` if its extension matters, and its folder must already exist.

An existing file is overwritten. A missing book, or one entered by hand with no
successful scan, exits nonzero.

## Add a book

```bash
pnpm --filter @goho/goho-cli start books create --title "The Hobbit" --category "Fiction" --author "J. R. R. Tolkien" --reading-level "Grade 4"
```

`--title` and `--category` are required; `--author` and `--reading-level` are
optional. Values are trimmed and must be nonblank. Categories are saved in lowercase,
and an unfamiliar name adds a new category. The command prints the complete book as
JSON.

A book already saved with the same title and author, ignoring case and extra spaces,
is printed unchanged instead of creating a duplicate, so its category and reading
level may differ from the supplied flags. A book with no author only matches another
with none.

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
images, then prints a JSON confirmation with `resource: "book"`. There is no confirmation prompt. A missing
book exits nonzero with the server's not-found problem.

Run `pnpm --filter @goho/goho-cli start --help` for command help.
