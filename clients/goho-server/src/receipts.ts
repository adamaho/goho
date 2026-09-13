import { Schema } from "effect";

const Name = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Nonempty text with surrounding whitespace removed.",
});

/**
 * Opaque token supplied by callers to make receipt creation retry-safe.
 *
 * @category models
 * @since 0.1.0
 */
export const IdempotencyKey = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0, {
    expected: "a non-whitespace idempotency key",
  }),
).annotate({
  identifier: "IdempotencyKey",
  description:
    "Required opaque, non-whitespace token. Reuse it with the same payload to retry creation safely; a different payload returns 409.",
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
  description: "A real calendar date in YYYY-MM-DD format, without a time or timezone.",
  examples: ["2026-09-13"],
});

/**
 * Exact decimal text accepted by the receipt API.
 *
 * @category models
 * @since 0.1.0
 */
export const DecimalString = Schema.String.check(
  Schema.isPattern(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i),
).annotate({
  identifier: "DecimalString",
  description:
    "An exact decimal encoded as a JSON string to preserve precision. Negative values and exponent notation are accepted.",
  examples: ["10.25", "-1.50", "1e2"],
});

/**
 * Decoded exact decimal text.
 *
 * @category models
 * @since 0.1.0
 */
export type DecimalString = typeof DecimalString.Type;

const ReceiptFields = {
  storeName: Name.annotateKey({
    description: "Store or merchant name.",
    examples: ["Example Store"],
  }),
  receiptDate: CalendarDate,
  category: Name.annotateKey({ description: "Receipt category.", examples: ["Groceries"] }),
  subtotal: DecimalString.annotateKey({ description: "Amount before tax.", examples: ["10.25"] }),
  tax: DecimalString.annotateKey({ description: "Tax amount.", examples: ["0.75"] }),
  total: DecimalString.annotateKey({ description: "Total receipt amount.", examples: ["11.00"] }),
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))).annotate({
    description: "Three uppercase currency letters, or null when unknown.",
    examples: ["USD", null],
  }),
};

const ReceiptItemInput = Schema.Struct({
  name: Name.annotateKey({ description: "Item name.", examples: ["Apples"] }),
  amount: DecimalString.annotateKey({
    description: "Item amount, including negative adjustments.",
    examples: ["10.25"],
  }),
}).annotate({
  identifier: "ReceiptItemInput",
  description: "One receipt line item. Repeated names are allowed.",
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
    description: "At least one item; array order defines persisted item order.",
  }),
}).annotate({
  identifier: "CreateReceiptRequest",
  description:
    "Receipt and ordered line items to persist in one transaction. Monetary values are exact decimal strings.",
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
  id: ReceiptId,
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
  ),
}).annotate({
  identifier: "Receipt",
  description: "Complete persisted receipt returned on creation or an idempotent replay.",
  examples: [
    {
      id: "5bb54486-9d88-4df7-89d1-1f2c3b2de21c",
      storeName: "Example Store",
      receiptDate: "2026-09-13",
      category: "Groceries",
      subtotal: "10.25",
      tax: "0.75",
      total: "11.00",
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
  description: "Maximum files processed concurrently in this batch, from 1 through 5.",
  examples: [5],
});

/**
 * Inputs for one synchronous receipt batch.
 *
 * @category models
 * @since 0.1.0
 */
export const ProcessRequest = Schema.Struct({
  rootFolderId: Schema.Trim.check(Schema.isNonEmpty()).annotate({
    description: "Google Drive root containing todo, processing, processed, and failed folders.",
    examples: ["drive-root"],
  }),
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()).annotate({
    description: "Destination Google spreadsheet with the configured RAW worksheet.",
    examples: ["sheet-id"],
  }),
  concurrency: Concurrency,
}).annotate({
  identifier: "ProcessRequest",
  description: "Inputs for one synchronous Google Drive receipt batch.",
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
  description: "Workflow stage where processing failed.",
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
    description: "Receipt processed successfully and moved to processed.",
  }),
  Schema.TaggedStruct("AlreadyProcessed", File).annotate({
    identifier: "AlreadyProcessed",
    description:
      "Existing spreadsheet rows were detected; parsing and appending were skipped and the file moved to processed.",
  }),
  Schema.TaggedStruct("Failed", {
    ...File,
    stage: Stage,
    disposition: Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]).annotate({
      description:
        "MovedToFailed confirms the compensating move succeeded. ClaimNotConfirmed means the initial claim failed and the file location is unknown.",
      examples: ["MovedToFailed"],
    }),
  }).annotate({
    identifier: "Failed",
    description: "Processing failed; disposition describes the file recovery state.",
  }),
  Schema.TaggedStruct("Stranded", { ...File, stage: Stage }).annotate({
    identifier: "Stranded",
    description:
      "Processing and the compensating move both failed. Locate the file by ID before retrying.",
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
