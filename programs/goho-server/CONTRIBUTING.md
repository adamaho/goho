# Contributing to @goho/goho-server

Follow the root [CONTRIBUTING.md](../../CONTRIBUTING.md) as well as this guide.
Complete its [development setup](../../CONTRIBUTING.md#development-setup) to
install Node.js, pnpm, and workspace dependencies before running server commands.

## Runtime configuration

Configure these in the environment file before starting the server:

| Variable                 | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `GOHO_SERVER_HOST`       | Bind address. Defaults to `127.0.0.1`; the container image sets `0.0.0.0`. |
| `GOHO_SERVER_PORT`       | Defaults to `3000`.                                                        |
| `DATABASE_URL`           | Required PostgreSQL connection URL. The pool must connect at startup.      |
| `GOHO_UPLOADS_DIRECTORY` | Required directory for durable original receipt files.                     |
| `OPENAI_API_KEY`         | A nonempty local placeholder, or a real key for image extraction.          |
| `OPENAI_MODEL`           | Model used for image extraction.                                           |

## Local Setup

Copy the environment template:

```bash
cp programs/goho-server/.env.example programs/goho-server/.env
```

Its OpenAI placeholder is enough to start the server and work with receipts
created through the API or the seed command.

From the repository root, start PostgreSQL, apply migrations, and run the server
in watch mode:

```bash
pnpm server:dev
```

Once the server is ready, seed the local database from a second terminal:

```bash
pnpm --filter @goho/goho-server db:seed
```

- Seeding creates four fictional receipts through the receipt creation API.
- It targets `http://127.0.0.1:3000`; set `GOHO_SERVER_URL` for another local server.
- It skips when any receipt already exists, so reruns add no duplicates.
- It does not upload images or call OpenAI.

An OpenAI key is not needed to create, read, or seed receipts locally. To process
uploaded receipt images, put a real `OPENAI_API_KEY` in the ignored `.env` file.
The key needs access to the configured `OPENAI_MODEL` with billing enabled. Then
follow the [CLI setup](../goho-cli/README.md).

## Database changes

Use the shared Postgres layer from `@goho/core`. Receipt tables, migrations, and
repository behavior stay in this server.

Return the same record schema from create and update operations as from the
corresponding find operation. Define the schema once and share it across those
operations.

### Receipts and items

- `receipts` holds only receipt data: store, receipt date, subtotal, tax, total,
  and currency.
- `receipt_items` stores each item's name, amount, and required category
  reference, linked to its receipt.
- Purchase dates use `date`. Amounts use `numeric` without two-decimal rounding.
  Decimal strings keep the finite values the parser supplies; they cannot recover
  precision already lost upstream.
- Currency applies to every item and total. The column is non-null and defaults to
  CAD; its migration backfilled existing nulls with CAD.
- API creation and GPT extraction both require an explicit three-letter currency
  code and reject null or missing values. Extraction keeps the receipt's currency,
  or uses CAD when nothing on the receipt suggests another. Extraction version 1
  records this required field. See [receipt creation](./README.md#create-a-receipt).
- Extraction version 2 moved the category from the transaction to each item.
  Uploads processed earlier keep their version 1 payloads as recorded.

Each item has a database-generated `bigint` identity `id` as its primary key. It
stays with the item through renames and position changes. `position` is the
item's order and is unique within its receipt; repeated item names are allowed.
Migration 0010 filled IDs for existing rows without firing update triggers, so
their timestamps kept their values.

### Categories

`categories` is one shared catalog of names for receipt items and books, with a
generated `bigint` identity `id` and display metadata. Each item's and book's
required, indexed `category_id` references it; a referenced category cannot be
deleted. A receipt has no category of its own: the API derives its `categories`
from its items, each once in item order. Items and books are written with a
`category` name and read with the category object.

- `kinds` is a nonempty `category_kind[]` (`receipt`, `book`) listing the domains
  a category applies to. A database constraint keeps each kind once, in enum
  order, so every response lists them the same way. Direct SQL inserts default
  to `{receipt}`.
- Migration 0014 made every existing category a receipt category by adding the
  column with that default, so no row was updated and timestamps stayed. It
  seeded `fiction` and `nonfiction` as book categories. An existing category with
  either name kept its ID, metadata and timestamps and also became a book category.

- `icon` is a required free-form icon identifier; the server does not limit it to
  the app's bundled icons, so clients decide how to show unfamiliar ones. `color`
  is a stable key from the app's colour palette, enforced by a database
  constraint. New categories default to `other` and `grey`.
- Migration 0013 seeds the canonical catalog on fresh databases: groceries,
  dining, shopping, household, personal care, health, gas, and charity, each with
  its preset icon and colour.

- Names are stored as PostgreSQL's `lower(btrim(name))`. Database constraints
  keep them unique, nonempty, trimmed, and lowercase. Case variants share one
  category; different words such as `grocery` and `groceries` stay separate.
- Saving a receipt, item, or book finds each category by name or creates it in
  the same transaction, so a failed or rolled-back save leaves no new category
  behind. A PATCH for a missing receipt, item, or book creates nothing. Reusing a
  category that already has the saving domain's kind does not update it. Reusing
  one from the other domain keeps its ID and adds the kind with a guarded update,
  so concurrent receipt and book saves both keep theirs. A receipt save looks up
  each distinct incoming name once; case or space variants are separate lookups
  that resolve to the same category.
- Categories stay when their items or books are deleted or moved to another category.
- Upload processing reads the current receipt category names before each AI
  request. The model's structured output only accepts those names, so it cannot
  invent a category; an empty catalog or any other name fails the upload. The
  stored extraction keeps the categories as the model returned them.
- Migration 0012 built the catalog from existing receipt categories, trimming
  space-padded legacy values from direct SQL, and linked
  each receipt without firing update triggers, so timestamps stayed and no
  history was added.
- Migration 0013 classified existing data deterministically, without AI. A fixed
  list of approved variant names maps into the canonical catalog, and unrelated
  names are kept. An existing canonical category keeps its ID; otherwise the
  oldest variant is renamed to the canonical name and keeps its ID. Each item
  inherited its receipt's mapped category, then receipts lost their reference.
  Without firing update triggers, records kept their timestamps and no history
  was added. Later corrections use item PATCH.

### Books

`books` is one shared list of unique books with a generated `bigint` identity
`id`, the `title` and `author` as entered, a required `category_id`, and a
nullable `reading_level` set only by hand.

- Identity is the title and author compared by `book_identity_text`: lowercase,
  whitespace runs collapsed to one space, then trimmed. What counts as whitespace
  follows PostgreSQL's locale, so some Unicode spaces, such as an internal
  non-breaking space, can stay distinct. Generated `title_key` and
  `author_key` columns store it under the `books_identity_key` unique constraint,
  which enforces uniqueness for concurrent saves. Search uses the same function
  and `strpos`, so punctuation and LIKE wildcards match literally.
- Creating a book looks up its identity first and returns an existing book
  without touching it or the catalog. Otherwise the category lookup and insert
  share one transaction, which is a savepoint inside a caller's transaction;
  when a concurrent save inserts the identity first, the insert does nothing,
  that transaction rolls back any category change, and the committed book is
  returned. Create, update, get and list all read through one private book
  selection, so they return the same record.
- A PATCH locks the book before resolving its category. Taking another book's
  identity violates `books_identity_key`, which maps to `BookConflict` (HTTP 409)
  and rolls back the whole correction, including a new category. Changing only
  the case or spacing of a book's own title or author is allowed.
- Books are listed by `created_at` then `id`, newest first, so corrections and
  duplicate creates do not reorder them.
- `hasImage` is `false` until book cover uploads arrive. There is no book edit
  history.

### Book uploads

`book_uploads` tracks cover scans as `receipt_uploads` tracks receipts, with its
own `book-uploads` queue and failure codes (`storage_failed`,
`processing_failed`, `book_creation_failed`, `internal_error`). A succeeded
upload records its `book_id`, extraction version 1 and the validated
`{ title, author, category }` JSON. Several uploads can succeed for one book,
and each keeps its original file.

### Uploads and transactions

`receipt_uploads` links each processed upload to its receipt. Once the upload
succeeds, it records the extraction version and the validated extraction JSON.

The repository inserts a receipt and all its items in one transaction. Inside a
caller's transaction, the insert joins it as a savepoint. Upload processing
inserts the receipt and marks the upload succeeded in one transaction. That
status change is what stops redelivered jobs from creating duplicate receipts.

Both upload queues share one persisted queue store on `goho_queues`, one
cleanup fiber, three attempts and the retry schedule. A job can fail in the
`receipt-uploads` queue without the worker recording it on the upload:

- If the process crashes during the final attempt, Effect's queue fails the job
  once its lock expires after two minutes. It checks every 30 seconds while a
  worker takes jobs.
- If every final `markFailed` write fails, the queue fails the job as soon as the
  handler exits.

A graceful shutdown releases the attempt for redelivery instead. The worker's
recovery pass runs at startup and every 30 seconds. It marks queued or
processing uploads whose job failed as `failed` with `internal_error`, so they
can be deleted. Pending or active jobs, succeeded uploads and existing failure
codes stay unchanged. A failed pass is logged and retried at the next interval.

### Record timestamps

`books`, `book_uploads`, `categories`, `receipts`, `receipt_items`, and `receipt_uploads` have required
`created_at` and `updated_at` columns. They use `timestamptz`, which stores an absolute instant
whatever the session time zone.

- New records default both timestamps to `now()`.
- On every update, including direct SQL, triggers keep `created_at` and set
  `updated_at` to the statement time.
- Inserting, editing, moving, or deleting an item also updates its parent
  receipt's `updated_at`. Moving an item updates both receipts.
- These changes roll back with the enclosing transaction. Cascading receipt
  deletion still works.
- The backfill gave existing items their receipt's creation time. Every new
  `updated_at` started at `created_at`, because past edit times are unknown.
  Existing upload timestamps were kept.
- Receipt responses do not include these timestamps.

### Edit history

Two tables record saved corrections, from PATCH requests and direct SQL alike.
Current receipt and item rows remain the source of truth, and nothing reads this
history yet.

| Table                  | Records                                  | Required references (all `ON DELETE CASCADE`)             |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `receipt_history`      | `store_name`, `receipt_date`, `category` | `receipt_id`                                              |
| `receipt_item_history` | `item_name`, `category`                  | `receipt_id` (the item's receipt at edit time), `item_id` |

- Update triggers write one row per field whose value actually changes. Each row
  stores the field, its before and after values, an operation ID, and an
  `edited_at` instant equal to the record's `updated_at`.
- Each updated receipt or item row gets its own operation ID, so fields changed
  together share one. A later update gets another, even in the same transaction.
- Dates are stored as ISO `YYYY-MM-DD` text whatever the session's DateStyle.
- A category change is a change of `category_id`, recorded with the old and new
  category names. Rows recorded before migration 0012 keep their original case.
- Since migration 0013, category changes are item edits. Earlier receipt
  `category` rows remain readable, and receipts record no new ones.
- Inserts, same-value writes, parent timestamp updates from item changes, and
  other columns record nothing.
- Migration 0011 adds no baseline for existing rows, so history starts with the
  next edit.
- History commits or rolls back with its edit. If a history row cannot be
  written, the edit fails.
- Deleting a receipt deletes its receipt and item history. Deleting an item
  deletes that item's history.

### Running migrations locally

`DATABASE_URL` in `programs/goho-server/.env` points to the local Compose database
in the example. From the repository root:

```bash
pnpm --filter @goho/infra-local infra:up
pnpm --filter @goho/goho-server db:migrate
```

`infra:up` starts Postgres and creates the database on first startup. `db:migrate`
connects to it and creates or updates the tables. Where migrations run:

- `pnpm server:dev` runs both commands through Turbo before starting the server.
- Direct package `start` and `dev` commands do not run migrations; run
  `db:migrate` first.
- The container entry point applies migrations before launching the server, on
  every start or restart.
- Other deployments must run migrations explicitly before starting a new server
  version.

### How the runner works

`src/database/migrate.ts` loads the connection and calls the registry in
`src/database/migrations.ts`, which uses Effect's `PgMigrator.fromRecord` and
`PgMigrator.run`.

- The runner creates `goho_migrations` if needed and reads the highest completed
  migration ID.
- It runs registered migrations with higher IDs in numeric order, recording each
  ID, name, and completion time.
- Pending migrations and their records run in one transaction, so a failure rolls
  back the whole pending batch. The `goho_migrations` table itself may remain
  after a failed first run.
- Rerunning a completed batch does nothing. Applied files are not checksummed and
  do not rerun when their contents change.

### Adding a migration

1. Create the next numbered file under `src/database/migrations`, for example
   `0002-receipt-notes.ts`. Its ID must be higher than every existing migration;
   do not insert an older number into the sequence.
2. Default-export an `Effect.gen` that obtains `SqlClient.SqlClient` and runs the
   SQL, following `0001-receipts.ts`. The SQL must be able to run inside a
   transaction, so operations such as `CREATE INDEX CONCURRENTLY` cannot be used.
3. Import the file in `src/database/migrations.ts` and add it to the record, for
   example `"0002_receipt_notes": receiptNotes`. The key uses an underscore after
   the numeric ID; the file name uses kebab-case. Files are not discovered
   automatically, and there is no migration generator.
4. Run `db:migrate` locally, then again to confirm nothing remains. Add an
   integration assertion for the resulting schema or behavior. For a change that
   transforms existing data, test upgrading a populated old schema as well as a
   fresh database.
5. Commit the new file and registry entry with the code that uses the schema.
   Once a migration has run on a shared database, leave it unchanged and make
   corrections in a new migration. There is no down or rollback command.

## Verification and tests

Run the repository checks before submitting changes:

```bash
pnpm check
```

Test selection lives in `vitest.config.ts`, with named `unit` and `integration`
projects. Unit tests exclude `*.integration.test.ts` and need no database:

```bash
pnpm --filter @goho/goho-server test:unit
```

For integration tests, start the isolated test database described in
[local infrastructure](../../infra/local/README.md), set `TEST_DATABASE_URL`, and
run `pnpm --filter @goho/goho-server test:integration`. Each repository test
creates a temporary schema, applies the real migration registry, and drops the
schema afterward. No Google or OpenAI credentials are required.
