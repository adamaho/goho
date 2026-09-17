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
    "Receipt creation token, unique across receipts with no expiry. Case and received whitespace are significant.",
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
  description: "Real calendar date in YYYY-MM-DD format, years 0100–9999.",
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
  description: "Exact decimal encoded as a string to preserve precision.",
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
      description: "Store or merchant name.",
      examples: ["Example Store"],
    }),
  ),
  receiptDate: CalendarDate.annotateKey({ description: "Date of the purchase." }),
  category: Name.pipe(
    Schema.annotateEncoded({
      description: "Receipt category.",
      examples: ["Groceries"],
    }),
  ),
  subtotal: DecimalString.annotateKey({ description: "Amount before tax.", examples: ["10.25"] }),
  tax: DecimalString.annotateKey({ description: "Tax amount.", examples: ["0.75"] }),
  total: DecimalString.annotateKey({ description: "Total receipt amount.", examples: ["11"] }),
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))).annotate({
    description:
      "Currency code, or null when unknown. Codes are not checked against a currency registry.",
    examples: ["USD", null],
  }),
};

const ReceiptItemInput = Schema.Struct({
  name: Name.pipe(
    Schema.annotateEncoded({
      description: "Item name.",
      examples: ["Apples"],
    }),
  ),
  amount: DecimalString.annotateKey({
    description: "Item amount, including negative adjustments.",
    examples: ["10.25"],
  }),
}).annotate({
  identifier: "ReceiptItemInput",
  description: "Receipt line item; repeated names are allowed.",
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
    description: "Line items in receipt order. Order affects idempotency comparison.",
  }),
}).annotate({
  identifier: "CreateReceiptRequest",
  description:
    "Receipt and ordered items. Names are trimmed and must remain nonempty. Amounts are not rounded, converted, or checked for arithmetic consistency.",
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
export const ReceiptId = Schema.String.check(
  Schema.makeFilter(
    (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
    {
      expected: "a positive PostgreSQL BIGINT encoded as a decimal string",
      toJsonSchema: () => ({ pattern: "^[1-9]\\d*$", maxLength: 19 }),
    },
  ),
).annotate({
  identifier: "ReceiptId",
  description: "Server-assigned positive BIGINT identity identifying a persisted receipt.",
  examples: ["42"],
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
    description: "Receipt identity, retained on replay.",
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
    description: "Items in ascending position order.",
  }),
}).annotate({
  identifier: "Receipt",
  description:
    "Stored receipt with trimmed names and normalized decimal strings; for example, `11.00` becomes `11`.",
  examples: [
    {
      id: "42",
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
  description: "Maximum files processed concurrently.",
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
        "Google Drive root with exactly one immediate child folder for each of `todo`, `processing`, `processed`, and `failed`.",
      examples: ["drive-root"],
    }),
  ),
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()).pipe(
    Schema.annotateEncoded({
      description:
        "Destination spreadsheet with a `RAW` worksheet: store, date, category, item, price, and source file ID in columns A–F.",
      examples: ["sheet-id"],
    }),
  ),
  concurrency: Concurrency.annotateKey({
    description: "Maximum files processed concurrently; no HTTP default.",
  }),
}).annotate({
  identifier: "ProcessRequest",
  description:
    "Batch inputs. IDs are trimmed and must remain nonempty. The service account needs access to download and move files and update the spreadsheet.",
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
    description: "Original Google Drive file ID.",
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
  description: "Stage where processing failed.",
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
      "Rows appended to Sheets and file moved to `processed`; database persistence is not guaranteed.",
  }),
  Schema.TaggedStruct("AlreadyProcessed", File).annotate({
    identifier: "AlreadyProcessed",
    description:
      "File already recorded in Sheets and moved to `processed`, without new rows or a database write.",
  }),
  Schema.TaggedStruct("Failed", {
    ...File,
    stage: Stage,
    disposition: Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]).annotate({
      description:
        "`MovedToFailed`: file moved to `failed`. `ClaimNotConfirmed`: initial move failed; file location is unknown.",
      examples: ["MovedToFailed"],
    }),
  }).annotate({
    identifier: "Failed",
    description: "Processing failed; disposition describes the file recovery state.",
  }),
  Schema.TaggedStruct("Stranded", { ...File, stage: Stage }).annotate({
    identifier: "Stranded",
    description:
      "Processing and the move to `failed` both failed. Locate the file by ID before retrying.",
  }),
]).annotate({
  identifier: "ReceiptProcessingResult",
  description: "Outcome for one file; provider diagnostics are omitted.",
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
