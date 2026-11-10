# @goho/goho-cli

Calls the Goho server to check its status; to upload, inspect, list, patch, and delete receipts and
books; to add receipts, books, and recipes by hand; to list, view, download photos for, and delete
recipes; and to import recipes from web pages. OpenAI credentials belong only to the [server](../goho-server/README.md).

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

Recipe imports live under `recipes uploads` with the same four subcommands; its `create`
takes a recipe page URL instead of an image path.

## Delete responses

All six delete commands print a JSON confirmation instead of a text message:

```json
{ "deleted": true, "resource": "book", "id": "12" }
```

`resource` is `book`, `receipt`, `recipe`, `book-upload`, `receipt-upload`, or `recipe-upload`, and `id` stays a
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

## List recipes

```bash
pnpm --filter @goho/goho-cli start recipes list
```

The command prints a JSON array of every saved recipe's headline details, by title A to Z
ignoring case, then newest first. Each entry has its `id`, `title`, `source`,
`totalTimeSeconds`, `hasImage`, and timestamps, but no ingredients, steps, or yield; use
`recipes view` for those. `source` is null for a recipe saved directly. No recipes prints `[]`.

## View a recipe

```bash
pnpm --filter @goho/goho-cli start recipes view <positive-integer-recipe-id>
```

The command prints the complete recipe as JSON, including its ingredients, steps, and
yield. A malformed ID or a valid ID that does not exist exits nonzero; a missing recipe
prints the server's not-found problem.

## Download a recipe photo

```bash
pnpm --filter @goho/goho-cli start recipes image 5
pnpm --filter @goho/goho-cli start recipes image 5 --output photos/pancakes.jpg
```

The command saves the recipe's stored photo and prints its `path`, `contentType`, and
`sizeBytes` as JSON. Without `--output` the file is named `recipe-<id>` with the image's
extension, in the current directory. `--output` is used exactly as given, so check
`contentType` if its extension matters, and its folder must already exist.

An existing file is overwritten. A missing recipe, or one with no photo on file, exits nonzero.

## Add a recipe

```bash
pnpm --filter @goho/goho-cli start recipes create \
  --title Pancakes \
  --ingredient 'id=flour,name=Flour,quantity=2,unit=cup' \
  --ingredient 'id=butter,name=Butter\, melted,quantity=1/2,unit=cup' \
  --ingredient 'id=salt,name=Salt,quantity=to taste' \
  --step 'Mix {{ingredient=flour}} flour with salt.' \
  --step 'Stir in {{ingredient=butter,portion=1/2}} butter and {{text=a pinch}} of salt.' \
  --yield 'quantity=4,label=servings' \
  --total-time-seconds 1800
```

`--title`, at least one `--ingredient`, and at least one `--step` are required. Repeat
`--ingredient` and `--step` in recipe order. `--yield` and `--total-time-seconds` are
optional; leaving one out saves it as unknown rather than guessing it. There is no JSON
file or stdin input, no source URL, and no photo. Every successful call saves a new recipe,
even with a title already saved, so running the command twice leaves two recipes. The
server assigns the ID and timestamps, and the recipe has `hasImage: false` and a null
`source`. The command prints the complete saved recipe as JSON.

### Ingredients

Each `--ingredient` takes `id`, `name`, and `quantity`, plus `unit` for a numeric amount, in
any order. The `id` is how step marks name the ingredient and must be unique in the recipe;
it must be nonblank with no surrounding spaces. Names are trimmed and must be nonblank.

| Amount         | Example                | Meaning                                        |
| -------------- | ---------------------- | ---------------------------------------------- |
| Whole number   | `2`                    | Exactly 2                                      |
| Fraction       | `1/2`, `3/2`           | Exactly that fraction, kept as written         |
| Decimal        | `0.5`, `2.25`          | Converted exactly to a fraction, such as `9/4` |
| Range          | `2..3`, `1/2..3/4`     | From the first amount up to the second         |
| Wording        | `to taste`, `a few`    | Saved as written, trimmed                      |
| Forced wording | `text:1 or 2 handfuls` | Everything after `text:`, never a number       |

Numbers must be above zero, with a numerator and denominator no larger than
9007199254740991; decimals are converted without rounding, so one that is too precise fails.
A range's first amount must be below its second. Mixed numbers are not supported: write
`1 1/2` as `3/2`. Anything that starts with a digit, sign, or dot, or spells `Infinity` or
`NaN`, must be one of the number forms above and never becomes wording; `-1`, `.5`, `1e3`,
`1/0`, `2..1`, `1..`, and `2 cups` all fail. Prefix wording that starts like a number with
`text:`; spaces before the prefix are ignored.

Numeric amounts need a `unit`: `millilitre`, `litre`, `cup`, `tablespoon`, `teaspoon`, `gram`,
`kilogram`, `count`, `clove`, `can`, `bunch`, `pinch`, `dash`, `handful`, or `knob`. Wording
takes no unit, and supplying one fails rather than being ignored.

`--yield` takes `quantity` and `label`, with the same amount forms and no `unit`; the label
says what the quantity counts. `--total-time-seconds` is a whole number of seconds from `0`
to `2147483647`; durations such as `30m` are not read.

In `--ingredient` and `--yield` values, write a comma as `\,` and a backslash as `\\`. Any
other backslash is kept as written. An unescaped comma, an unknown or repeated key, or a
missing key fails.

### Steps

A step is plain text with optional marks. Plain text is kept exactly, spaces included.

| Mark                               | Meaning                                 |
| ---------------------------------- | --------------------------------------- |
| `{{ingredient=butter}}`            | All of the `butter` ingredient          |
| `{{ingredient=flour,portion=1/2}}` | Half of the `flour` ingredient          |
| `{{text=a pinch}}`                 | Marked wording, kept exactly as written |

An ingredient mark takes `ingredient` and an optional `portion`, the share of that
ingredient's quantity the step uses: a whole number, fraction, or decimal above 0 and up
to 1, defaulting to `1`. It names an ingredient ID from the same recipe. A text mark takes
only `text`, which must not be blank.

Outside marks, write a literal `{{` as `\{{` and a backslash as `\\`; a lone `{`, `}` or
`}}` stays plain text, and any other backslash is kept as written. Inside a mark, write a
comma as `\,`, a `}` as `\}`, a `{{` as `\{{`, and a backslash as `\\`:

```bash
--step 'Add {{text=salt\, pepper}}.'
--step 'Write \{{example}} literally.'
```

A value that starts with `-` must be attached with `=`, such as `--step='- Stir well.'`;
otherwise it is read as another flag.

An empty step, an unclosed or nested mark, a lone `}` inside a mark, an empty mark, unknown
or repeated keys, or a mark mixing `text` with `ingredient` or `portion` fails.

Invalid input exits nonzero with `goho:cli:invalid-input` before sending a request.

## Delete a recipe

```bash
pnpm --filter @goho/goho-cli start recipes delete <positive-integer-recipe-id>
```

The command permanently removes the recipe, every import linked to it, and its photo,
then prints a JSON confirmation with `resource: "recipe"`. There is no confirmation
prompt. A missing recipe exits nonzero with the server's not-found problem.

## Import a recipe from a web page

```bash
pnpm --filter @goho/goho-cli start recipes uploads create "https://example.com/recipes/pancakes"
```

The command sends the page URL to the server and immediately prints the queued import as
JSON; the CLI never fetches the page itself. Keep its UUID to check processing status. The
URL is trimmed and must be an absolute `http` or `https` URL without a username or password,
up to 2048 UTF-8 bytes. Whether the page is public and reachable is only known once the
server fetches it. An invalid URL exits nonzero before sending a request.

Every call queues a new import. When the page, ignoring its fragment, is already saved as a
recipe, the server links that recipe instead of fetching the page again.

## Check recipe import status

```bash
pnpm --filter @goho/goho-cli start recipes uploads view <upload-id>
```

The command prints the import as JSON, including its `source` and current status: `queued`,
`processing`, `succeeded`, or `failed`. A successful import includes the saved recipe's
`recipeId`; a failed import includes a stable `failureCode`. To retry a failed import, run
`recipes uploads create` with the same URL again; there is no need to delete the failed
import first.

## List recipe imports

```bash
pnpm --filter @goho/goho-cli start recipes uploads list
```

The command prints a JSON array containing every recipe import and its current status,
newest first. No imports prints `[]`.

## Delete a failed recipe import

```bash
pnpm --filter @goho/goho-cli start recipes uploads delete <upload-id>
```

The command permanently removes the failed import, then prints a JSON confirmation with
`resource: "recipe-upload"`. There is no confirmation prompt. An import that is queued,
processing, or succeeded exits nonzero and nothing changes; delete the recipe to remove its
successful imports. A missing import also exits nonzero.

Run `pnpm --filter @goho/goho-cli start --help` for command help.
