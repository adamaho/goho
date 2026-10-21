# @goho/goho-server

Exposes receipt uploads, retrieval, creation, correction, deletion, a shared book
list, health checks, and API documentation. The server implements the shared
[@goho/goho-api](../../packages/goho-api/README.md) contract, and the CLI connects
through the derived [typed client](../../clients/goho-server/README.md).

The server binds to `127.0.0.1` by default and requires no authentication. It is intended
for local use or a private network.

For development and server setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## API

JSON resource responses return their payload under a top-level `data` field.

- `GET /health` returns HTTP 200 with `{"data":{"status":"ok"}}` when the HTTP server is running.
  This is a liveness check; it does not query PostgreSQL or OpenAI.
- `GET /openapi.json` serves the OpenAPI contract.
- `GET /docs` serves Swagger UI. Try it out sends real requests to this server.

Open [Swagger docs](http://127.0.0.1:3000/docs) after starting the server with the
default port.

### List receipts

`GET /receipts` returns every persisted receipt and its ordered items under
`data`. Receipts are ordered by receipt date and creation time, newest first.
An empty database returns `{"data":[]}`. A retrieval failure returns HTTP 500
with `{"_tag":"InternalServerError"}`.

### Upload a receipt

`POST /receipt-uploads` accepts one multipart `file` containing a JPEG, PNG, or
WebP image no larger than 20 MB. It stores the original, creates a durable upload
record, queues processing, and immediately returns HTTP 202 with the upload
resource under `data`.

Set `GOHO_UPLOADS_DIRECTORY` to the directory where original receipt files should
be retained. File names are opaque IDs; original names and MIME types are stored
with the upload record in PostgreSQL.

### Get receipt upload status

`GET /receipt-uploads/:uploadId` returns `queued`, `processing`, `succeeded`, or
`failed`. A successful upload includes its generated receipt ID. A failed upload
includes a stable failure code; diagnostic details remain in server logs.

A valid UUID with no matching upload returns HTTP 404. Malformed IDs return HTTP
400, and retrieval failures return HTTP 500.

### Delete a failed receipt upload

`DELETE /receipt-uploads/:uploadId` permanently removes a failed upload and its
original photo. It returns HTTP 204 with no response body. Failed uploads have
`status: "failed"` and a failure code after the worker exhausts its three attempts.
If a worker crash abandons the final attempt, the upload fails with
`internal_error` within about three minutes after a worker runs again, while the
database is available.

Queued, processing, and succeeded uploads return HTTP 409 with
`{"_tag":"Conflict"}`. To remove a successful scan and its photo, delete its
receipt instead. Missing or previously deleted uploads return HTTP 404, and
malformed UUIDs return HTTP 400.

Database or photo cleanup failures return HTTP 500. Database changes roll back
so cleanup can be retried; an already missing photo does not block deletion.
As with receipt deletion, a commit failure after photo removal can leave the
upload without its photo until deletion is retried.

### Get a receipt

`GET /receipts/:receiptId` returns one complete receipt under `data`. A valid
positive integer ID with no matching receipt returns HTTP 404 with `{"_tag":"NotFound"}`.
A malformed ID returns HTTP 400. Retrieval failures return
HTTP 500 with `{"_tag":"InternalServerError"}`.

### Create a receipt

`POST /receipts` creates a receipt and its ordered items atomically from the
JSON body shown in Swagger. Every successful call saves a new receipt.

Names are trimmed and decimal strings normalized (`11.00` becomes `11`).
Every item names its own `category`. Categories are saved and returned in
lowercase, so `Groceries` and `groceries` are the same category; an unfamiliar
name adds a new one with the generic `other` icon and `grey` colour. The complete
receipt is returned under `data`. Each returned item has a server-generated `id`,
a decimal string like receipt IDs, its zero-based `position` in the receipt, and
its `category` object (`id`, `name`, `icon`, `color`, and `kinds`). `icon` is a free-form
identifier string, so clients should fall back for ones they don't know; `color`
is one of the fixed palette keys. `kinds` lists, once each and in a fixed order,
whether the category is used for `receipt` items, `book`s, or both; books and
receipts share one catalog. A receipt has no
category of its own: its `categories` lists each distinct item category once, in
item order.

Invalid payloads return HTTP 400 with an empty body; validation or persistence
failures return HTTP 500 with `{"_tag":"InternalServerError"}`.

### Correct a receipt

`PATCH /receipts/:receiptId` corrects `storeName`, `receiptDate`, or both.
Omitted fields keep their values. It returns HTTP 200 with the complete saved
receipt under `data`.

`PATCH /receipts/:receiptId/items/:itemId` corrects the `name`, `category`, or
both of an existing item on that receipt, using its `id`. It returns HTTP 200
with only the saved item (`id`, `position`, `name`, `amount`, and `category`)
under `data`; fetch the receipt to see the rest of it, including its updated
`categories`.

Names and categories are trimmed and must stay nonempty, and categories are
saved in lowercase as on creation; dates must be real
`YYYY-MM-DD` dates. Amounts, currency, item positions, the item lineup, the
upload record, the original photo, and stored extraction data do not change.
Repeating a correction with the same values succeeds, and later corrections win.

Empty bodies, unsupported or null fields, invalid values, malformed receipt IDs,
and malformed or out-of-range item IDs return HTTP 400 with an empty body;
nothing is saved, even when some supplied fields are valid. A missing receipt, or an item
ID that is not on that receipt, returns HTTP 404 with `{"_tag":"NotFound"}`. Persistence failures
return HTTP 500 with `{"_tag":"InternalServerError"}` and save nothing.

### Delete a receipt

`DELETE /receipts/:receiptId` permanently removes the receipt, its items, linked
upload record, original photo, and stored extraction data. It returns HTTP 204
with no response body. Manually created receipts can also be deleted.

A missing or previously deleted receipt returns HTTP 404. Malformed IDs return
HTTP 400. Database or photo cleanup failures return HTTP 500; database changes
roll back so deletion can be retried. An already missing photo does not block deletion.

Photo storage does not participate in the database transaction. If the database
commit fails after photo removal, the receipt may remain without its photo;
retrying deletion completes the cleanup.

### Books

Books form one shared list. Each book has `id` (a decimal string like receipt
IDs), `title`, `author`, a `category` object as on receipt items, a nullable
`readingLevel`, and `hasImage`, which is `false` until cover uploads are added.
Create, retrieval, and listing all return this same shape under `data`.

A book's identity is its title and author, ignoring case and extra whitespace;
the spelling it was first saved with is shown. The same title by another author
is a different book.

- `POST /books` takes `title`, `author`, `category`, and an optional
  `readingLevel` (null or omitted when unknown). Values are trimmed and must stay
  nonempty, and unsupported fields are rejected. The category is saved in
  lowercase and joins the shared catalog if it is new. If the identity is already
  saved, the saved book returns unchanged with HTTP 200; the request's category
  and reading level are ignored and no category is created.
- `GET /books` lists books newest first. `?search=` keeps books whose title or
  author contains the text, ignoring case and extra whitespace; punctuation
  matches literally, and a blank search lists every book. Sending `search` more
  than once returns HTTP 400.
- `GET /books/:bookId` returns one book.

Malformed IDs and invalid bodies return HTTP 400 with an empty body. A missing
book returns HTTP 404 with `{"_tag":"BookNotFound"}`. Persistence failures return
HTTP 500 with `{"_tag":"BooksUnavailable"}` and save nothing.
