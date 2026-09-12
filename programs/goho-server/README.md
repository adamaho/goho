# @goho/goho-server

Runs receipt processing behind one synchronous HTTP endpoint. The CLI connects through
[@goho/goho-server-client](../../clients/goho-server/README.md).

The server binds to `127.0.0.1` and requires no authentication. It is intended for local use.

For development and server setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## API

`POST /receipts/process` accepts JSON:

```json
{ "rootFolderId": "drive-root", "spreadsheetId": "sheet-id", "concurrency": 5 }
```

IDs must be nonempty and concurrency must be an integer from 1 through 5.
The response is an array of receipt outcomes after the batch finishes.
HTTP 400 means invalid input, 409 means another batch is
running, and 500 means the batch could not complete. Individual failed receipts
remain successful HTTP responses with `Failed` or `Stranded` outcomes.
Provider causes are logged on the server and omitted from API responses.

`POST /receipts/import-sheets-raw` accepts JSON:

```json
{ "spreadsheetId": "sheet-id", "worksheet": "RAW", "apply": false }
```

This is the one-shot historical RAW import. It reads columns A-F, maps item
rows into the existing `receipts` and `receipt_items` tables, and never appends
to Sheets. `apply: false` is a dry-run. HTTP 400 means invalid input and 500
means the import could not complete.

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

Before parsing, the server reads `RAW!F:F` once and uses the IDs as an
idempotency snapshot. A claimed file whose ID is already present skips image
validation, download, OpenAI parsing, and spreadsheet appending, then moves to
`processed`.

Leave historical F cells blank unless the corresponding real Drive file ID is
known. Values such as `Legacy` or generated placeholders do not provide retry
protection. Historical receipts without IDs can be duplicated if their source
files are returned to `todo`; existing historical rows are never modified by
the server.

### Completion

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

Retrying is safe when spreadsheet rows may already have been appended: the
real Drive ID in column F causes the retry to skip another append and finish by
moving the file to `processed`.
