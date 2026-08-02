# @goho/goho-cli

Command-line interface for Goho.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for credential provisioning and local
development setup.

## Commands

### Process receipts

Process receipts from the `todo` folder in a Google Drive receipt workflow:

```bash
goho receipts process <root-folder-id> <spreadsheet-id> [--concurrency <count>]
```

- `<root-folder-id>` is the Drive folder containing the receipt workflow.
- `<spreadsheet-id>` is the destination Google Sheets spreadsheet.
- `--concurrency` controls the maximum number of active receipt workers. It
  defaults to `5` and accepts integers from `1` through `5`.

The root folder must contain exactly one immediate child folder with each of
these names:

```text
todo
processing
processed
failed
```

The service account must have **Editor** access to both the workflow root and
destination spreadsheet so the CLI can download and move files and update
`RAW`. Do not run multiple processing commands against the same root
concurrently; claiming does not provide cross-process locking.

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
CLI does not change worksheet formatting. Every item row created from a receipt
contains the same real Drive file ID in column F.

Before parsing, the command reads `RAW!F:F` once and uses the IDs as an
idempotency snapshot. A claimed file whose ID is already present skips image
validation, download, OpenAI parsing, and spreadsheet appending, then moves to
`processed`.

Leave historical F cells blank unless the corresponding real Drive file ID is
known. Values such as `Legacy` or generated placeholders do not provide retry
protection. Historical receipts without IDs can be duplicated if their source
files are returned to `todo`; existing historical rows are never modified by
the command.

### Completion and exit status

After all receipt workers finish, the command prints safe diagnostics for
failed receipts followed by this summary:

```text
Processed: <count>
Already processed: <count>
Failed: <count>
Stranded: <count>
```

An empty `todo` folder prints zero for all four counts. The command exits with
status `0` when both `Failed` and `Stranded` are zero, and status `1` otherwise.
Normal output includes filenames, Drive IDs, stages, and dispositions where
applicable, but not provider errors or stack traces.

### Failure outcomes and recovery

- `MovedToFailed` means processing failed after a successful claim and the
  compensating move succeeded. The file is known to be in `failed`.
- `ClaimNotConfirmed` means the initial `todo` to `processing` move failed. The
  CLI does not know the file's current parent and does not attempt a blind
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

Display all commands and global options:

```bash
goho --help
```

## Configuration

The CLI reads the following environment variables:

- `GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE`: path to a Google service-account JSON
  key file
- `GOOGLE_AUTH_SCOPES`: comma-separated Google OAuth scopes; receipt processing
  requires `https://www.googleapis.com/auth/spreadsheets` and
  `https://www.googleapis.com/auth/drive`
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_MODEL`: OpenAI model used for receipt processing
