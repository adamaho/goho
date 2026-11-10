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
| `GOHO_UPLOADS_DIRECTORY` | Required directory for durable original receipt and book cover files.      |
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

- Seeding creates four fictional receipts and five books through the receipt and
  book creation APIs. The books cover several categories, with and without reading
  levels, and one long title.
- It targets `http://127.0.0.1:3000`; set `GOHO_SERVER_URL` for another local server.
- Receipts and books seed independently. Receipts are skipped when any receipt
  already exists. Each book is created by title and author, which returns an
  existing match unchanged. Reruns add no duplicates.
- It does not upload images or call OpenAI, so seeded books have no covers or
  book uploads.

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
`id`, the `title` and nullable `author` as entered, a required `category_id`,
a nullable `reading_level` set only by hand, and an optional cover.

- Identity is the title and author compared by `book_identity_text`: lowercase,
  whitespace runs collapsed to one space, then trimmed. What counts as whitespace
  follows PostgreSQL's locale, so some Unicode spaces, such as an internal
  non-breaking space, can stay distinct. Generated `title_key` and
  `author_key` columns store it under the `books_identity_key` unique constraint,
  which enforces uniqueness for concurrent saves.
- A null author is unknown, never a placeholder string. Its `author_key` is
  null, and the constraint is `NULLS NOT DISTINCT`, so each title has at most
  one book without an author, separate from that title by any known author.
  Lookups compare the author key with `IS NOT DISTINCT FROM`, and a null author
  never matches a search, which still checks the title. Migration 0018 dropped
  the `NOT NULL` constraints and rebuilt the key under the same name, so the
  insert's `ON CONFLICT` target and the `BookConflict` mapping are unchanged;
  it updated no rows, so IDs, timestamps, uploads and covers stayed as they were. Search uses the same function
  and `strpos`, so punctuation and LIKE wildcards match literally.
- Creating a book looks up its identity first and returns an existing book
  without touching it or the catalog. Otherwise the category lookup and insert
  share one transaction, which is a savepoint inside a caller's transaction such
  as an upload's; when a concurrent save inserts the identity first, the insert
  does nothing, that transaction rolls back any category change, and the
  committed book is returned. Create, update, get and list all read through one
  private book selection, so they return the same record.
- A PATCH locks the book before resolving its category. Taking another book's
  identity violates `books_identity_key`, which maps to `BookConflict` (HTTP 409)
  and rolls back the whole correction, including a new category. Changing only
  the case or spacing of a book's own title or author is allowed.
- Books are listed by `created_at` then `id`, newest first, so corrections and
  duplicate creates do not reorder them.
- A book's cover is its own stored file: `image_file_id` and
  `image_content_type` (JPEG, PNG or WebP) are both set or both null, in the
  `books_image_complete` check. `hasImage` is whether it is set, and the cover
  is served from these columns alone, without reading uploads. A book saved by
  hand has none until a scan fills it. There is no book edit history.
- Deleting a book locks it, deletes its uploads, then deletes the book, and
  returns its cover's and uploads' file IDs, each once, since a scanned cover is
  also its upload's file; the service removes the files before committing. A
  direct SQL delete of a book that still has uploads fails, so no stored file
  loses its record.
- Migration 0021 gave each book the file and type of the upload marked as its
  cover, then dropped that flag and its one-cover-per-book index. Other books
  got no cover. The book timestamp trigger was disabled for the backfill, so
  every book kept its ID, values and timestamps; no upload row changed.

### Book uploads

`book_uploads` tracks cover scans as `receipt_uploads` tracks receipts, with its
own `book-uploads` queue and failure codes (`storage_failed`,
`processing_failed`, `book_creation_failed`, `internal_error`). A succeeded
upload records its `book_id`, extraction version and the validated
`{ title, author, category }` JSON. Several uploads can succeed for one book,
and each keeps its original file.

- Extraction asks only for the title, author and category, choosing from the
  current `book` category names read before each attempt; it never sets a
  reading level, and the model cannot add a category.
- The author is a required, nullable field of the structured output. The prompt
  asks for printed authors in order, always leaving out illustrators,
  translators, editors and other non-author credits. With no author printed it
  asks for the printed publisher, and otherwise null, using only names on the
  cover. Version
  2 records this contract; uploads processed earlier keep their version 1
  payloads, whose author is always text.
- Saving uses the book's `findOrCreate`, so a scan of a saved identity reuses
  the book unchanged, including its reading level and category, and a new book
  has no reading level.
- `markSucceeded` locks the book, marks the upload succeeded, then copies that
  upload's file and type to the book only when it has no cover. Scans completing
  in any order never replace a cover; a book entered by hand gets the first
  successful scan's, and filling it updates the book's `updated_at`.
- The book save, cover choice and success status share one transaction, so a
  status change that fails because the upload was already finished, failed or
  deleted rolls back a new book and its category with it, and sets no cover. File reads and AI
  calls happen before that transaction.
- A scan that succeeds after its book was deleted fails without changes; a
  later attempt, if any, saves the book again.
- Deleting a failed upload removes only its row and file. Other states return
  409; deleting the book removes its successful scans.

### Recipes

Migration 0019 adds the recipe tables, and migration 0020 makes the saved
recipe, not the import, the identity of a page. The recipe and recipe upload
repositories read and write them, behind the `recipes` and `recipe-uploads`
services and the recipe upload worker; no endpoint uses them yet.

- `recipes` stands alone, with a generated `bigint` identity `id`, a nonblank
  `title`, nonempty JSON arrays of `ingredients` and `steps`, an optional JSON
  object `yield` and an optional nonnegative `total_time_seconds`. The database
  checks only these top-level shapes; the API schemas validate the rest. A
  recipe needs no upload.
- A recipe's optional photo is a stored file: `image_file_id` and
  `image_content_type` (JPEG, PNG or WebP) are both set or both null.
- A recipe imported from a page keeps the URL its first import submitted as
  `source_url`, and that URL's normalized form as `normalized_url`, unique in
  `recipes_normalized_url_key`, so a page has at most one saved recipe. Both are
  set or both null (`recipes_source_complete`); a recipe saved directly has
  neither and never matches a page. The check does not prove the key is the
  source's normalized form; the repository writes both from the same URL.
  Redirects play no part: both come from the submitted URL.
- `recipe_uploads` tracks one import with `status` and, as in `receipt_uploads`,
  only a succeeded upload has a `recipe_id` and only a failed one has a
  `failure_code` (`page_unavailable`, `no_recipe_found`, `ambiguous_recipe`,
  `incomplete_recipe`, `processing_failed`, `recipe_creation_failed`,
  `internal_error`). Several succeeded uploads can link one recipe.
- An upload's source is a row in its own table. `recipe_upload_urls` keeps the
  `url` as submitted; several uploads can share a page. The row is deleted with
  its upload.
- Each URL is limited to 2048 bytes of UTF-8, not characters: an upload's URL
  and a recipe's source and key. The API checks the limit on the URL as
  submitted and after normalization.
- The foreign key stops a direct SQL delete of a recipe that still has an upload;
  delete its uploads first. The repository's recipe deletion does this for you.
- Migration 0020 gave each recipe saved by an import that import's URL and
  normalized URL, unique under 0019's constraints, then dropped the uploads'
  normalized URLs. Recipes saved directly got neither. The recipe timestamp
  trigger was disabled for the backfill, so every ID, value and timestamp
  stayed; no upload row changed.

The repositories decode every stored recipe and upload with the API schemas, so
stored JSON that no longer validates, or an upload missing its URL row, fails
the read instead of being dropped or coerced.

- Saving a recipe directly always inserts a new one without a source or photo;
  titles are not unique. A missing yield or total time is SQL `NULL`. Create,
  get and list read through one selection of `recipes` alone, and a recipe's
  `source` is its `source_url`, or null. Listing reads no ingredients, steps or
  yield, and sorts by title ignoring case, then newest first.
- Every submission inserts a queued upload and its URL in one savepoint, so the
  service can enqueue its job atomically.
- Saving an imported recipe inserts it with its photo, source and key in one
  row or, when that page already has a recipe, returns that recipe unchanged,
  with its content, photo and source. A concurrent save of the same page waits on the key's insert and
  returns the committed recipe; only that key is tolerated. The reread relies on
  READ COMMITTED, PostgreSQL's default, and fails if the recipe was deleted in
  between.
- Status changes are guarded updates. `markProcessing` accepts queued or
  processing uploads, so a redelivered job continues; `markFailed` accepts
  queued or processing; `markSucceeded` accepts only processing and locks the
  recipe first. Saving the recipe and marking its upload succeeded can share a
  caller's transaction, so a refused status change rolls back the recipe.
- Deleting a recipe locks it, deletes every upload that linked it with their
  URLs, then the recipe, and returns the photo's file ID for the caller to
  remove before committing. Queued, processing or failed uploads of the page
  did not link it and stay. An upload that links the recipe concurrently either
  commits first and is deleted with it, or fails without changes. A later
  import of the page saves a new recipe.
- Only a failed upload can be deleted on its own. Deleting it is not needed to
  import the page again: a new submission is a new upload.

### Recipe imports

`recipes/import.ts` reads one recipe from its page for the recipe upload
worker. It fetches the URL as submitted, extracts the recipe with `OPENAI_MODEL`, then
downloads the page's photo. The submitted URL stays the source wherever
redirects lead.

- `services/web-fetch.ts` fetches only public internet addresses. Every URL,
  including each redirect and the photo, must be http or https without a
  username or password, and an IP literal must be public. A URL with
  credentials is refused before any lookup, never fetched with them dropped;
  the API's `RecipeUrl` rejects them in submitted URLs too.
- Each hostname resolves once per connection, through the connection's own
  lookup, and every address it returns must be public. The socket connects to
  those addresses, so DNS cannot rebind between check and connect, and TLS
  still verifies the URL's hostname. Loopback, private, link-local, shared,
  reserved, multicast, documentation, IPv4-mapped and NAT64 ranges are refused.
- Requests carry no trace headers, so Goho's tracing never reaches the sites.
- Limits: five redirects, 15 seconds per fetch with its redirects, a 5 MiB page
  and a 10 MiB photo. Bodies must be uncompressed.
- The page must be HTML. It is decoded by its byte order mark, then the HTTP
  charset, then a `<meta>` charset in its first 1024 bytes, then UTF-8.
- The page reader is a small linear scanner, not a full HTML parser, so hostile
  markup cannot stall it. Its JSON-LD Recipe objects, wherever they appear,
  including in a footer, and its visible text without scripts, styles,
  navigation or footers go to the model as untrusted data. Each is capped at
  40,000 characters, and the title and description at 1,000.
- The model either returns one main recipe or reports `no_recipe_found`,
  `ambiguous_recipe` or `incomplete_recipe`. Steps get a light cleanup that
  keeps their cooking meaning. Temperatures are written in Fahrenheit only: a
  page's Fahrenheit value is kept, and a Celsius-only one is converted and
  rounded to the nearest 5 °F (180 °C is 355 °F). Cup and spoon measures keep their unit. The
  server converts ounces and pounds to grams, and US or imperial fluid ounces
  to millilitres, exactly with integer fractions; a result outside safe
  integers fails rather than rounds. Any other unit stays a text quantity
  without a unit. The converted recipe must decode as a `CreateRecipeRequest`.
- Failures are an `ImportError` with the upload failure code and `retryable`:
  timeouts, transport errors, 408, 429 and 5xx responses, and retryable model
  failures, including output that does not validate, can be retried; blocked
  addresses, other statuses, non-HTML pages and the three content rejections
  cannot.
- The photo is the only Recipe object's image, or else the Open Graph or
  Twitter image. Its type comes from its bytes: JPEG, PNG or WebP. A photo that
  fails to download or has another type is logged and dropped; it never fails
  the import.

### Recipe upload processing

- Submitting a URL always saves a new queued upload and offers its job in one
  transaction, whether or not the page was submitted, imported or failed
  before.
- Each worker process takes one queue job at a time, as the receipt and book
  workers do, so a process runs at most one recipe import at once. The 5 MiB
  page and 10 MiB photo caps bound the downloaded bytes, not the import's
  memory: received chunks, the decoded page text and its lowercase copies,
  parsed JSON-LD and the text sent to the model add to it. Receipt and book
  jobs run alongside, one of each, and every server replica runs its own
  workers.
- A job first looks up a saved recipe by its upload's normalized URL. When there
  is one, the upload links it and succeeds, without fetching the page, calling
  the AI or storing a photo; a recipe deleted before the link fails the attempt,
  and the next imports the page.
- Otherwise the page fetch and AI run before any transaction. Then the photo is
  stored, and the recipe is saved, or found when a concurrent import of the page
  saved it first, and the upload marked succeeded in one transaction, which a
  redelivered job's finished upload refuses. Jobs of one page that both miss the
  lookup can both fetch the page and call the AI, but save one recipe; both
  uploads succeed, the recipe keeps the first commit's content, photo and URL,
  and the other's photo is removed. A failed save also removes the stored photo; a photo that cannot be
  stored is logged and the recipe saved without it. A crash between storing the
  photo and committing, or before removing an unused one, can leave an
  unreferenced file.
- A temporary failure, as the import's `retryable` reports it, or a failed save,
  fails the attempt so the queue retries it; after the third attempt its
  failure code is recorded. A save that fails records `recipe_creation_failed`,
  and other unexpected failures `internal_error`. A rejection of the page
  (`no_recipe_found`, `ambiguous_recipe`, `incomplete_recipe` or an unusable
  page) is recorded at once and completes the job.
- A `CreateRecipeRequest` saved directly is saved at once, with no upload, job
  or AI. Its `source` is null.
- Deleting a recipe deletes every upload that linked it with their URLs and
  removes its photo before committing.

### Uploads and transactions

`receipt_uploads` links each processed upload to its receipt. Once the upload
succeeds, it records the extraction version and the validated extraction JSON.

The repository inserts a receipt and all its items in one transaction. Inside a
caller's transaction, the insert joins it as a savepoint. Upload processing
inserts the receipt and marks the upload succeeded in one transaction. That
status change is what stops redelivered jobs from creating duplicate receipts.

Every upload queue shares one persisted queue store on `goho_queues`, one
cleanup fiber, three attempts and the retry schedule. A job can fail in its
queue, `receipt-uploads`, `book-uploads` or `recipe-uploads`, without the worker
recording it on the upload:

- If the process crashes during the final attempt, Effect's queue fails the job
  once its lock expires after two minutes. It checks every 30 seconds while a
  worker takes jobs.
- If every final `markFailed` write fails, the queue fails the job as soon as the
  handler exits.

A graceful shutdown releases the attempt for redelivery instead. Each worker's
recovery pass runs at startup and every 30 seconds. It marks queued or
processing uploads whose job failed in their own queue as `failed` with
`internal_error`, so they can be deleted. Pending or active jobs, succeeded
uploads and existing failure codes stay unchanged. A failed pass is logged and
retried at the next interval.

Stored files are not part of SQL transactions. Upload deletion and book, receipt
or recipe deletion remove files before committing: a storage failure rolls the
rows back for a retry, but files already removed stay removed, and a failed
commit can leave rows whose files are gone until deletion is retried.

### Record timestamps

`books`, `book_uploads`, `categories`, `receipts`, `receipt_items`, `receipt_uploads`, `recipes`, and `recipe_uploads` have required
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
