import { Schema } from "effect";

const Name = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Nonempty text with surrounding whitespace removed.",
});

/**
 * Caller-supplied token identifying one receipt creation request.
 *
 * @category models
 * @since 0.1.0
 */
export const IdempotencyKey = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0, {
    expected: "a non-whitespace idempotency key",
    toJsonSchema: () => ({ pattern: "\\S" }),
  }),
).annotate({
  identifier: "IdempotencyKey",
  description:
    "Opaque token containing at least one non-whitespace character. Required in the `idempotency-key` header. Goho preserves the received value, including case and whitespace. Keys are unique across receipts in the database and have no implemented expiry. Reuse the key with the same normalized receipt data to retrieve the stored receipt; different normalized data returns HTTP 409.",
  examples: ["manual-entry-1"],
});

/**
 * Decoded receipt creation idempotency token.
 *
 * @category models
 * @since 0.1.0
 */
export type IdempotencyKey = typeof IdempotencyKey.Type;

/**
 * Real calendar date encoded as YYYY-MM-DD.
 *
 * @category models
 * @since 0.1.0
 */
export const CalendarDate = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    {
      expected: "a real calendar date in YYYY-MM-DD format",
      toJsonSchema: () => ({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    },
  ),
).annotate({
  identifier: "CalendarDate",
  description:
    "A real calendar date in YYYY-MM-DD format, without a time or timezone. The runtime accepts years 0100 through 9999.",
  examples: ["2026-09-13"],
});

/**
 * Exact decimal text accepted by the receipt API.
 *
 * @category models
 * @since 0.1.0
 */
export const DecimalString = Schema.String.check(
  Schema.isPattern(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i, {
    // JSON Schema patterns have no flags; preserve the runtime's case-insensitive exponent.
    toJsonSchema: () => ({ pattern: "^-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$" }),
  }),
).annotate({
  identifier: "DecimalString",
  description:
    "An exact decimal encoded as a JSON string to preserve precision. Negative values and exponent notation are accepted.",
  examples: ["10.25", "-1.50", "1e2", "1E2"],
});

/**
 * Decoded exact decimal text.
 *
 * @category models
 * @since 0.1.0
 */
export type DecimalString = typeof DecimalString.Type;

// Trim is a codec; OpenAPI needs field metadata on its encoded string side.
const ReceiptFields = {
  storeName: Name.pipe(
    Schema.annotateEncoded({
      description:
        "Store or merchant name. Surrounding whitespace is removed; the result must be nonempty.",
      examples: ["Example Store"],
    }),
  ),
  receiptDate: CalendarDate.annotateKey({ description: "Date of the purchase." }),
  category: Name.pipe(
    Schema.annotateEncoded({
      description:
        "Receipt category. Surrounding whitespace is removed; the result must be nonempty.",
      examples: ["Groceries"],
    }),
  ),
  subtotal: DecimalString.annotateKey({ description: "Amount before tax.", examples: ["10.25"] }),
  tax: DecimalString.annotateKey({ description: "Tax amount.", examples: ["0.75"] }),
  total: DecimalString.annotateKey({ description: "Total receipt amount.", examples: ["11"] }),
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))).annotate({
    description:
      "Currency expressed as three uppercase ASCII letters, or null when unknown. The field is required. The letters are not checked against a currency registry.",
    examples: ["USD", null],
  }),
};

const ReceiptItemInput = Schema.Struct({
  name: Name.pipe(
    Schema.annotateEncoded({
      description: "Item name. Surrounding whitespace is removed; the result must be nonempty.",
      examples: ["Apples"],
    }),
  ),
  amount: DecimalString.annotateKey({
    description: "Item amount, including negative adjustments.",
    examples: ["10.25"],
  }),
}).annotate({
  identifier: "ReceiptItemInput",
  description:
    "One line item supplied for receipt creation. Repeated names and negative amounts are allowed.",
  examples: [{ name: "Apples", amount: "10.25" }],
});

/**
 * Receipt data accepted by the generic creation endpoint. Array order defines item order.
 *
 * @category models
 * @since 0.1.0
 */
export const CreateReceiptRequest = Schema.Struct({
  ...ReceiptFields,
  items: Schema.NonEmptyArray(ReceiptItemInput).annotate({
    description:
      "At least one item. Array order defines zero-based persisted positions and participates in idempotency comparison.",
  }),
}).annotate({
  identifier: "CreateReceiptRequest",
  description:
    "Receipt and ordered line items to persist in one transaction. All fields are required, including nullable `currency`. Amounts use decimal strings without currency symbols. No currency conversion, two-decimal rounding, or validation of relationships between item amounts, subtotal, tax, and total is performed.",
  examples: [
    {
      storeName: "Example Store",
      receiptDate: "2026-09-13",
      category: "Groceries",
      subtotal: "10.25",
      tax: "0.75",
      total: "11.00",
      currency: "USD",
      items: [{ name: "Apples", amount: "10.25" }],
    },
  ],
});

/**
 * Decoded receipt creation input.
 *
 * @category models
 * @since 0.1.0
 */
export interface CreateReceiptRequest extends Schema.Schema.Type<typeof CreateReceiptRequest> {}

/**
 * Persisted receipt identity.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptId = Schema.String.check(Schema.isUUID()).annotate({
  identifier: "ReceiptId",
  description: "Server-assigned UUID identifying a persisted receipt.",
  examples: ["5bb54486-9d88-4df7-89d1-1f2c3b2de21c"],
});

/**
 * Decoded persisted receipt identity.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptId = typeof ReceiptId.Type;

/**
 * Complete receipt returned after creation or an idempotent replay.
 *
 * @category models
 * @since 0.1.0
 */
export const Receipt = Schema.Struct({
  id: ReceiptId.annotateKey({
    description: "Identity assigned on creation and retained on replay.",
  }),
  ...ReceiptFields,
  items: Schema.NonEmptyArray(
    Schema.Struct({
      position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
        description: "Zero-based item position within the receipt.",
        examples: [0],
      }),
      ...ReceiptItemInput.fields,
    }).annotate({
      identifier: "ReceiptItem",
      description: "A persisted receipt line item with its original position.",
      examples: [{ position: 0, name: "Apples", amount: "10.25" }],
    }),
  ).annotate({
    description:
      "Receipt items in ascending position order, starting at zero. Contains at least one item.",
  }),
}).annotate({
  identifier: "Receipt",
  description:
    "Complete persisted receipt returned with HTTP 200 on creation or replay. Names have surrounding whitespace removed. Decimal strings are normalized before storage, so their spelling can differ from the request.",
  examples: [
    {
      id: "5bb54486-9d88-4df7-89d1-1f2c3b2de21c",
      storeName: "Example Store",
      receiptDate: "2026-09-13",
      category: "Groceries",
      subtotal: "10.25",
      tax: "0.75",
      total: "11",
      currency: "USD",
      items: [{ position: 0, name: "Apples", amount: "10.25" }],
    },
  ],
});

/**
 * Complete persisted receipt.
 *
 * @category models
 * @since 0.1.0
 */
export interface Receipt extends Schema.Schema.Type<typeof Receipt> {}

/**
 * Maximum concurrent receipts in a batch.
 *
 * @category models
 * @since 0.1.0
 */
export const Concurrency = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })).annotate({
  identifier: "Concurrency",
  description: "Maximum files processed concurrently in one batch, from 1 through 5 inclusive.",
  examples: [5],
});

/**
 * Inputs for one synchronous receipt batch.
 *
 * @category models
 * @since 0.1.0
 */
export const ProcessRequest = Schema.Struct({
  rootFolderId: Schema.Trim.check(Schema.isNonEmpty()).pipe(
    Schema.annotateEncoded({
      description:
        "Google Drive folder ID. The root must contain exactly one immediate child folder named `todo`, `processing`, `processed`, and `failed`. Surrounding whitespace is removed; the result must be nonempty.",
      examples: ["drive-root"],
    }),
  ),
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()).pipe(
    Schema.annotateEncoded({
      description:
        "Destination Google spreadsheet ID. Requires an existing `RAW` worksheet with item columns A–E and source file IDs in F. Surrounding whitespace is removed; the result must be nonempty.",
      examples: ["sheet-id"],
    }),
  ),
  concurrency: Concurrency.annotateKey({
    description:
      "Maximum files processed concurrently in this batch. Required; no HTTP default is supplied.",
  }),
}).annotate({
  identifier: "ProcessRequest",
  description:
    "Required inputs for one synchronous Google Drive receipt batch. Grant the service account access to download and move workflow files and update the spreadsheet. Example folder and spreadsheet IDs are illustrative placeholders; replace them with real IDs.",
  examples: [{ rootFolderId: "drive-root", spreadsheetId: "sheet-id", concurrency: 5 }],
});

/**
 * Decoded receipt batch inputs.
 *
 * @category models
 * @since 0.1.0
 */
export interface ProcessRequest extends Schema.Schema.Type<typeof ProcessRequest> {}

const File = {
  fileId: Schema.String.annotate({
    description:
      "Original Google Drive file ID used to locate the file and match source IDs in `RAW!F:F`. Example IDs are illustrative placeholders.",
    examples: ["receipt-1"],
  }),
  fileName: Schema.String.annotate({
    description: "Original file name.",
    examples: ["receipt.png"],
  }),
};
const Stage = Schema.Literals([
  "Claim",
  "ValidateFile",
  "DownloadFile",
  "ParseReceipt",
  "AppendRows",
  "Complete",
]).annotate({
  identifier: "ProcessingStage",
  description:
    "Stage where the original operation failed: `Claim` moves from `todo` to `processing`; `ValidateFile` checks the MIME type; `DownloadFile` retrieves the image; `ParseReceipt` extracts receipt data; `AppendRows` writes item rows to Sheets; `Complete` moves to `processed`. Database save failures are logged separately and have no stage outcome.",
  examples: ["ParseReceipt"],
});

/**
 * Public receipt outcomes; diagnostic causes stay on the server.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptProcessingResult = Schema.Union([
  Schema.TaggedStruct("Processed", File).annotate({
    identifier: "Processed",
    description:
      "Receipt item rows were appended to Sheets and the file moved to `processed`. Database persistence is best effort, so this outcome does not confirm a database record.",
  }),
  Schema.TaggedStruct("AlreadyProcessed", File).annotate({
    identifier: "AlreadyProcessed",
    description:
      "The file ID was present in the initial `RAW!F:F` snapshot. Image validation, download, parsing, database persistence, and appending were skipped, and the file moved to `processed`.",
  }),
  Schema.TaggedStruct("Failed", {
    ...File,
    stage: Stage,
    disposition: Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]).annotate({
      description:
        "`MovedToFailed` confirms a successful claim followed by a successful compensating move to `failed`. `ClaimNotConfirmed` means the initial claim failed at stage `Claim`; the file location is unconfirmed and no compensating move was attempted.",
      examples: ["MovedToFailed"],
    }),
  }).annotate({
    identifier: "Failed",
    description: "Processing failed; disposition describes the file recovery state.",
  }),
  Schema.TaggedStruct("Stranded", { ...File, stage: Stage }).annotate({
    identifier: "Stranded",
    description:
      "Processing failed after a successful claim, and the compensating move to `failed` also failed. The final file location is unconfirmed. Locate the file by ID before retrying.",
  }),
]).annotate({
  identifier: "ReceiptProcessingResult",
  description:
    "Outcome for one file. Provider diagnostics are omitted; failure outcomes remain HTTP 200 batch results.",
  examples: [
    { _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" },
    { _tag: "AlreadyProcessed", fileId: "receipt-2", fileName: "receipt.png" },
    {
      _tag: "Failed",
      fileId: "receipt-3",
      fileName: "receipt.png",
      stage: "ParseReceipt",
      disposition: "MovedToFailed",
    },
    { _tag: "Stranded", fileId: "receipt-4", fileName: "receipt.png", stage: "Complete" },
  ],
});

/**
 * Decoded public outcome for one receipt.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptProcessingResult = Schema.Schema.Type<typeof ReceiptProcessingResult>;
