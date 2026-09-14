# @goho/goho-server

Exposes receipt listing, creation, synchronous batch processing, health checks,
and API documentation. The CLI connects through
[@goho/goho-server-client](../../clients/goho-server/README.md).

The server binds to `127.0.0.1` and requires no authentication. It is intended for local use.

For development and server setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## API

Every successful endpoint returns its payload under a top-level `data` field.

- `GET /health` returns HTTP 200 with `{"data":{"status":"ok"}}` when the HTTP server is running.
  This is a liveness check; it does not query PostgreSQL, Google, or OpenAI.
- `GET /openapi.json` serves the OpenAPI contract.
- `GET /docs` serves Swagger UI. Try it out sends real requests to this server.

Open [Swagger docs](http://127.0.0.1:3000/docs) after starting the server with the
default port.

### List receipts

`GET /receipts` returns every persisted receipt and its ordered items under
`data`. Receipts are ordered by receipt date and creation time, newest first.
An empty database returns `{"data":[]}`. A retrieval failure returns HTTP 500
with `{"_tag":"InternalServerError"}`.

### Create a receipt

`POST /receipts` creates a receipt and its ordered items atomically. Supply an
`idempotency-key` header and the JSON body shown in Swagger.

Names are trimmed and decimal strings normalized (`11.00` becomes `11`). Reuse
the same key and normalized data to retrieve the stored receipt with HTTP 200.
Changed data or item order returns HTTP 409. After a lost response, retry with
the same key and data. The complete receipt is returned under `data`.

Invalid headers or payloads return HTTP 400 with an empty body. Conflicts return
`{"_tag":"Conflict"}`; validation or persistence failures return HTTP 500 with
`{"_tag":"InternalServerError"}`.

### Process a receipt batch

`POST /receipts/process` accepts JSON:

```json
{ "rootFolderId": "drive-root", "spreadsheetId": "sheet-id", "concurrency": 5 }
```

Replace the example IDs with real IDs. All fields are required; concurrency has
no HTTP default. See Swagger for field constraints.

The response `data` contains one outcome per file in Drive listing order after
completion, or an empty array when no files are found. `Failed` and `Stranded` outcomes still
return HTTP 200. Invalid input returns HTTP 400 with an empty body; an overlapping
batch on this server returns HTTP 409 with `{"_tag":"Conflict"}`. Batch failure
returns HTTP 500 with `{"_tag":"InternalServerError"}` and may leave partial changes.

Accepted work continues after client disconnect. After a lost response or server
restart, inspect Drive, Sheets, and server logs before retrying; recovery is manual.

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

Files whose IDs already appear below the `RAW!F:F` header at batch start move to
`processed` without new rows or a database write.

Leave historical F cells blank unless the corresponding real Drive file ID is
known. Values such as `Legacy` or generated placeholders do not provide retry
protection. Historical receipts without IDs can be duplicated if their source
files are returned to `todo`; existing historical rows are never modified by
the server.

### Completion

`Processed` confirms appended Sheets rows and a move to `processed`; database
persistence is not guaranteed. `AlreadyProcessed` confirms an existing source
file ID in Sheets and a move to `processed`. Batches are not atomic.

The [CLI](../goho-cli/README.md) prints outcome counts and sets its exit status.

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

Keep real source file IDs in the same spreadsheet to prevent duplicate appends.
Inspect rows after an uncertain append before returning a file to `todo`.
Retries do not restore missing database records.
