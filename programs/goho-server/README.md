# @goho/goho-server

Exposes receipt creation, synchronous batch processing, health checks, and API documentation. The CLI connects through
[@goho/goho-server-client](../../clients/goho-server/README.md).

The server binds to `127.0.0.1` and requires no authentication. It is intended for local use.

For development and server setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## API

- `GET /health` returns HTTP 200 with `{"status":"ok"}` when the HTTP server is running.
  This is a liveness check; it does not query PostgreSQL, Google, or OpenAI.
- `GET /openapi.json` serves the OpenAPI contract generated from Effect schemas.
- `GET /docs` renders interactive Swagger UI, with bundled assets and the same
  generated contract. Models include descriptions and examples. Try it out sends
  real requests to this server.

Open [Swagger docs](http://127.0.0.1:3000/docs) after starting the server with the
default port. The health and documentation routes require no authentication.

### Create a receipt

`POST /receipts` creates a receipt and its ordered items in one PostgreSQL
transaction. It returns HTTP 200 with the complete persisted receipt on creation
and replay. This operation does not call Google Drive, Google Sheets, or OpenAI.

Supply an `idempotency-key` header, for example `manual-entry-1`, and a JSON body:

```json
{
  "storeName": "Example Store",
  "receiptDate": "2026-09-13",
  "category": "Groceries",
  "subtotal": "10.25",
  "tax": "0.75",
  "total": "11.00",
  "currency": "USD",
  "items": [{ "name": "Apples", "amount": "10.25" }]
}
```

All fields are required. `currency` accepts three uppercase ASCII letters or
explicit `null`; it is not checked against a currency registry. Names are trimmed
and must remain nonempty. `receiptDate` must be a real calendar date in
`YYYY-MM-DD` format with a year from 0100 through 9999. `items` must contain
at least one item; array order determines
zero-based positions in the response. Repeated names and negative amounts are
accepted. Amounts use decimal strings, including exponent notation. The server
does not check arithmetic relationships between the amounts or convert currencies.

The response adds a server-assigned `id` UUID and a `position` to each item. Names
are trimmed and decimal strings normalized before storage; the example's
`"total": "11.00"` returns as `"total": "11"`.

The key must contain at least one non-whitespace character. Goho preserves the
received key, including case and whitespace. Keys are unique across receipts in
the database, with no implemented expiry. Reuse the same key with the same
normalized data to retrieve the stored receipt. Changed data or item order returns
HTTP 409. HTTP 400 indicates invalid headers or payloads and has an empty body.
HTTP 409 returns `{"_tag":"Conflict"}`; repository validation or persistence
failures return HTTP 500 with `{"_tag":"InternalServerError"}`. Diagnostic causes
stay in server logs. Failed transactions do not retain a receipt or cached error
response. After a lost response, reuse the same key and data to avoid creating a
second receipt.

### Process a receipt batch

`POST /receipts/process` accepts JSON:

```json
{ "rootFolderId": "drive-root", "spreadsheetId": "sheet-id", "concurrency": 5 }
```

All three fields are required; the HTTP API supplies no concurrency default.
IDs have surrounding whitespace removed and must remain nonempty. The example
IDs are placeholders; replace them with real Drive and spreadsheet IDs.
Concurrency must be an integer from 1 through 5 inclusive. The response is an
array of receipt outcomes in Drive listing order after the batch finishes.
HTTP 400 means invalid input and has an empty body. HTTP 409 returns
`{"_tag":"Conflict"}` when another batch is running in this server process,
including one for a different root or spreadsheet. HTTP 500 returns
`{"_tag":"InternalServerError"}` when batch setup or execution fails; some work
can already have completed. Individual failed receipts
remain successful HTTP responses with `Failed` or `Stranded` outcomes.
Provider causes are logged on the server and omitted from API responses.

An accepted batch continues when its client disconnects. The lock is local to this
server process and is released when processing finishes. Restarting or killing the
server can leave files in `processing`; there is no durable job or automatic recovery.
A lost response does not mean no work happened. Inspect the folders, Sheets, and
server logs before retrying. HTTP clients or proxies may time out during a long batch.

## Receipt workflow

The root folder must contain exactly one immediate child folder with each of
these names:

```text
todo
processing
processed
failed
```

The service account must have **Editor** access to both the workflow root and
destination spreadsheet so the server can download and move files and update
`RAW`. Run only one server against a workflow. The server rejects overlapping batches with HTTP 409; claiming does not provide cross-process locking.

Supported receipt MIME types are `image/jpeg`, `image/png`, and `image/webp`.
An unsupported file is claimed and then handled as a failed receipt.

### Spreadsheet contract

The destination spreadsheet must contain an existing worksheet named `RAW`
with this A-F layout:

| Column | Header           | Value                               |
| ------ | ---------------- | ----------------------------------- |
| A      | `store`          | Store name                          |
| B      | `date`           | Receipt date in `YYYY-MM-DD` format |
| C      | `category`       | Inferred transaction category       |
| D      | `item`           | Purchased item name                 |
| E      | `price`          | Item price or negative adjustment   |
| F      | `source_file_id` | Original Google Drive file ID       |

Cell F1 must contain `source_file_id`. Hide column F manually after setup; the
server does not change worksheet formatting. Every item row created from a receipt
contains the same real Drive file ID in column F.

Before parsing, the server reads `RAW!F:F` once and uses the IDs below the header
as a snapshot of previously recorded source files. A claimed file whose ID is
already present skips image validation, download, OpenAI parsing, database
persistence, and spreadsheet appending, then moves to `processed`.

Leave historical F cells blank unless the corresponding real Drive file ID is
known. Values such as `Legacy` or generated placeholders do not provide retry
protection. Historical receipts without IDs can be duplicated if their source
files are returned to `todo`; existing historical rows are never modified by
the server.

### Completion

For each newly parsed receipt, the server attempts to save the receipt and its
items in one database transaction before appending Sheets rows. Expected database
failures and five-second attempt timeouts are logged, and Sheets processing
continues. `Processed` confirms the append and move to `processed`; it does not
confirm database persistence. `AlreadyProcessed` confirms the snapshot match and
move, with no new database write or append. Database writes, Sheets appends, and
Drive moves do not share a transaction, and the batch is not atomic.

The server returns public receipt outcomes. The [CLI](../goho-cli/README.md)
prints the four counts and sets its exit status. An empty batch returns an empty array.

### Failure outcomes and recovery

- `MovedToFailed` means processing failed after a successful claim and the
  compensating move succeeded. The file is known to be in `failed`.
- `ClaimNotConfirmed` means the initial `todo` to `processing` move failed. The
  server does not know the file's current parent and does not attempt a blind
  compensating move.
- `Stranded` means processing failed after a successful claim and the move to
  `failed` also failed. The file's final location is not confirmed.

Use this recovery procedure for any failed receipt or a process interrupted
while files may be in `processing`:

1. Record the Drive file ID from the diagnostic output. For an interrupted
   process, obtain the ID from the file details in Drive.
2. Locate the file by that Drive ID and inspect its current parent. Do not issue
   a blind move based only on the reported outcome.
3. Correct the underlying configuration, file, OpenAI, spreadsheet, or Drive
   access problem.
4. If the file needs another attempt, manually move it from its confirmed
   current parent back to `todo`. Files left in `processing` after termination
   must also be returned to `todo` manually.
5. Run one processing command for the root and verify its final summary.

A later batch skips another append when the real Drive ID is present in its
initial column F snapshot, then moves the file to `processed`. This depends on
retaining those IDs and using the same spreadsheet. Inspect rows after an
uncertain append before returning a file to `todo`; the snapshot does not provide
cross-process locking or reconcile missing database records.
