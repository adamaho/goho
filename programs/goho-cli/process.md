# Receipt Processing Plan

## Objective

Implement a bounded-concurrency pipeline that processes receipt images from a
Google Drive workflow, extracts structured receipt data with OpenAI, appends item
rows to the `RAW` worksheet, and moves each source file to the appropriate final
folder.

The pipeline must isolate failures by receipt. One failed receipt must not stop
other receipts from completing.

## Command Interface

Extend the existing command to accept the Drive root folder and destination
spreadsheet as positional arguments:

```bash
goho receipts process <root-folder-id> <spreadsheet-id> --concurrency 5
```

The `--concurrency` flag must:

- default to `5`
- accept values from `1` through `5`
- control the maximum number of receipts processed concurrently

The worksheet name is fixed as `RAW`. The implementation must derive these
ranges internally:

```text
Append rows: RAW!A:F
Read file IDs: RAW!F:F
```

## Spreadsheet Layout

The `RAW` worksheet must use these columns:

```text
A store
B date
C category
D item
E price
F source_file_id
```

Column F should be hidden after it is added. Every item row produced from one
receipt must contain the same Google Drive file ID in column F.

The source file ID is the idempotency key. Before parsing a receipt, the
pipeline must check whether its file ID already appears in `RAW!F:F`. If it
does, the pipeline must skip AI parsing and spreadsheet appending, then move the
file to `processed`.

### Existing Rows Without File IDs

Existing rows with an empty column F should remain unchanged unless they can be
confidently associated with their original Drive file.

The pipeline must ignore blank file ID cells when building the set of processed
receipt IDs. This means:

- existing spreadsheet data remains valid
- all newly processed receipts receive a file ID
- idempotency is guaranteed for newly processed receipts
- a historical receipt without a backfilled ID can still be duplicated if its
  source file is manually returned to `todo`

Do not generate replacement IDs for historical rows. A generated value would
not match the real Drive file ID and would not prevent a duplicate. Historical
IDs may be backfilled manually by locating the corresponding file in Drive and
putting its actual file ID on every spreadsheet row produced from that receipt.

## Drive Workflow

The Drive root folder must contain these immediate child folders:

```text
todo
processing
processed
failed
```

The command must resolve and retain each folder's Drive ID before processing
files.

The Google service account must have Editor access to the Drive root folder.
The configured scopes must permit file movement:

```env
GOOGLE_AUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive
```

Read-only Drive access is insufficient; receipt processing requires the full
Drive scope shown above.

## Supported Files

The first implementation must accept only receipt images with these MIME types:

```text
image/jpeg
image/png
image/webp
```

Unsupported file types must be treated as receipt-processing failures and moved
to `failed` after the file has been claimed.

The implementation should enforce a reasonable maximum image size before
sending data to OpenAI. If Drive metadata is extended to include file size, use
that value before downloading. Otherwise enforce the limit while collecting the
download stream.

## Receipt Model

Use an Effect Schema matching this structure:

```ts
const Receipt = Schema.Struct({
  store: Schema.Struct({
    name: Schema.String,
  }),
  date: Schema.String,
  transaction: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        price: Schema.Number,
      }),
    ),
    category: Schema.String,
    subtotal: Schema.Number,
    tax: Schema.Number,
    total: Schema.Number,
  }),
});
```

Add validation so that:

- store, item, and category names are not empty
- at least one item is present
- all numeric values are finite
- the date is a real calendar date formatted as `YYYY-MM-DD`
- the year is 2025 or later

The `subtotal`, `tax`, and `total` fields remain part of the required parsed
object even though the initial A-F row mapping does not persist them.

## OpenAI Parsing

Keep model selection in `OPENAI_MODEL`. Do not hardcode a model in the receipt
pipeline.

Call `Ai.Service.generateObject` with:

- `objectName: "receipt"`
- the required `Receipt` schema
- a system message containing the receipt parsing instructions
- a user message containing a short extraction request and the downloaded image
  as an Effect AI file part

The image part must contain:

```ts
{
  type: "file",
  mediaType: file.mimeType,
  fileName: file.name,
  data: imageBytes,
}
```

Effect's OpenAI integration uses strict JSON Schema output for
`generateObject`, so no provider-specific `structuredOutputs` option is needed.

### System Prompt Requirements

The system prompt must preserve the following extraction behavior:

- expand recognizable store-name abbreviations
- expand recognizable item-name abbreviations
- represent discounts and `TPD/<item number>` adjustments as negative prices
- infer a transaction category from the purchased items
- format dates as `YYYY-MM-DD`
- reject years before 2025 through schema validation
- return numeric prices without currency symbols
- preserve displayed monetary values without currency conversion
- ignore payment methods, loyalty identifiers, and unrelated barcodes unless
  needed to identify the store or date

Remove instructions to include commentary or mark uncertainty because the
required structured schema has no field for that information. Structured output
validation, rather than prompt wording alone, must enforce the response shape.

## Row Mapping

Map every parsed item to one spreadsheet row:

```ts
receipt.transaction.items.map((item) => [
  receipt.store.name,
  receipt.date,
  receipt.transaction.category,
  item.name,
  item.price,
  file.id,
]);
```

Append all rows for one receipt in a single Sheets request. Use:

```text
range: RAW!A:F
valueInputOption: RAW
majorDimension: ROWS
```

Pass `RAW` explicitly so receipt text and source file IDs are stored without
formula evaluation or automatic type coercion.

## Single-Receipt Pipeline

Implement one named effect for processing one Drive file. It must perform these
steps in order:

1. Move the file from `todo` to `processing` to claim it.
2. Check whether the file ID is already present in the processed ID set.
3. If already present, move the file from `processing` to `processed` and return
   an `AlreadyProcessed` result.
4. Validate the file MIME type and size.
5. Download the file and collect its byte stream.
6. Parse and validate the receipt with OpenAI.
7. Convert the parsed receipt to A-F rows.
8. Append all rows in one request to `RAW!A:F`.
9. Move the file from `processing` to `processed`.
10. Return a `Processed` result.

The Drive move API should use folder-oriented option names:

```text
sourceFolderId
destinationFolderId
```

instead of the current `sourceAddress` and `destinationAddress` names.

## Failure Handling

If MIME validation, download, AI parsing, schema validation, spreadsheet
writing, or final movement fails after the file has been claimed, attempt to
move the file from `processing` to `failed`.

Each worker must return one typed result rather than failing the entire batch:

```text
Processed
AlreadyProcessed
Failed
Stranded
```

`Failed` means the operation failed and the source file was moved to `failed`.

`Stranded` means the operation failed and the compensating move to `failed` also
failed. The result must retain the file ID, file name, failed stage, original
cause, and compensation cause for diagnostics.

If the initial claim from `todo` to `processing` fails, report the failure but
do not assume the file's current parent. Avoid a second blind move that could
conflict with another operation.

Hard process termination cannot guarantee compensation. A terminated process
may leave files in `processing`. For the initial implementation, those files
must be manually returned to `todo`. The source file ID check makes retries safe
when spreadsheet rows were already written.

## Batch Processing

Before starting workers:

1. Validate and resolve the four workflow folders.
2. Read `RAW!F:F` and build a set of non-empty source file IDs.
3. List immediate files in `todo`.

Process the finite file list with bounded Effect concurrency:

```ts
Effect.forEach(files, processReceipt, { concurrency });
```

Every worker must handle its own expected failures and return a result. This
prevents one failed receipt from interrupting other workers.

Do not support multiple concurrent CLI invocations against the same Drive root
in the first implementation. Concurrency is provided within one invocation;
cross-process claiming would require a stronger distributed locking strategy.

## Completion Summary

After all workers finish, print a summary:

```text
Processed: <count>
Already processed: <count>
Failed: <count>
Stranded: <count>
```

Exit successfully when `Failed` and `Stranded` are both zero. Exit with status
1 after printing the summary when either count is nonzero.

Do not expose Google provider error classes or stack traces in normal CLI
output. Preserve internal causes in typed results and translate the final
failure summary through `GohoCli.CommandError`.

## Code Organization

Keep the command adapter in:

```text
src/commands/receipts.ts
```

Move receipt schemas, prompts, row mapping, single-file processing, and batch
orchestration into one application-local module initially:

```text
src/receipts/process.ts
```

Keep user-safe command error translation in:

```text
src/errors.ts
```

The command adapter should only define arguments and flags, provide the runtime
layers, invoke the batch workflow, and map the final error to `CommandError`.

## Implementation Order

1. Add the receipt schema and revised system prompt.
2. Extend Drive metadata and move option names as needed.
3. Keep the Sheets append input option explicit and use `RAW` for receipt rows.
4. Update the writable Drive scope in `.env.example` and contributor guidance.
5. Add the spreadsheet ID argument and bounded concurrency flag.
6. Add Google Sheets to the command's runtime layer graph.
7. Implement image download and structured AI parsing.
8. Implement A-F row mapping and spreadsheet append.
9. Implement Drive claiming, successful completion, and failure compensation.
10. Implement source file ID lookup and retry idempotency.
11. Implement batch result aggregation and command exit behavior.
12. Update package documentation with the final command interface and recovery
    procedure.

Automated tests are explicitly deferred for this implementation. Validate the
pipeline manually with one successful receipt, one unsupported file, one
missing-key configuration, and one retry whose file ID already exists in column
F before processing a full `todo` batch.
