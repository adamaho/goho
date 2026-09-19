import { Schema } from "effect";

const Name = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Nonempty text with the extra whitespace scraped off the boards.",
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
    "Your receipt-creation play call, bud. It stays unique across receipts, never expires, and treats case and whitespace as different inputs.",
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
  description: "A real calendar date in YYYY-MM-DD format, from year 0100 through 9999.",
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
  description: "An exact decimal kept as text so no precision gets lost in the shuffle.",
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
      description: "Store or merchant named on the receipt.",
      examples: ["Example Store"],
    }),
  ),
  receiptDate: CalendarDate.annotateKey({ description: "Date the purchase hit the ice." }),
  category: Name.pipe(
    Schema.annotateEncoded({
      description: "Receipt category in the lineup.",
      examples: ["Groceries"],
    }),
  ),
  subtotal: DecimalString.annotateKey({ description: "Amount before tax.", examples: ["10.25"] }),
  tax: DecimalString.annotateKey({ description: "Tax amount.", examples: ["0.75"] }),
  total: DecimalString.annotateKey({ description: "Final receipt total.", examples: ["11"] }),
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))).annotate({
    description:
      "Three-letter currency code, or null when nobody knows, bud. Codes are not checked against a registry.",
    examples: ["USD", null],
  }),
};

const ReceiptItemInput = Schema.Struct({
  name: Name.pipe(
    Schema.annotateEncoded({
      description: "Item name on the receipt.",
      examples: ["Apples"],
    }),
  ),
  amount: DecimalString.annotateKey({
    description: "Item amount; negative adjustments can suit up too.",
    examples: ["10.25"],
  }),
}).annotate({
  identifier: "ReceiptItemInput",
  description: "One receipt line item; repeat names are fair game.",
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
      "Line items in receipt order. Shuffle the lineup and the idempotency check changes.",
  }),
}).annotate({
  identifier: "CreateReceiptRequest",
  description:
    "The full receipt lineup, bud. Names are trimmed and stay nonempty; amounts are not rounded, converted, or checked against the totals.",
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
export const ReceiptId = Schema.String.check(Schema.isPattern(/^[1-9]\d{0,18}$/)).annotate({
  identifier: "ReceiptId",
  description: "The receipt's positive number on the roster, bud.",
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
    description: "The receipt's roster number, kept the same on a replay.",
  }),
  ...ReceiptFields,
  items: Schema.NonEmptyArray(
    Schema.Struct({
      position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
        description: "Zero-based spot in the receipt lineup.",
        examples: [0],
      }),
      ...ReceiptItemInput.fields,
    }).annotate({
      identifier: "ReceiptItem",
      description: "A saved receipt line item in its original slot.",
      examples: [{ position: 0, name: "Apples", amount: "10.25" }],
    }),
  ).annotate({
    description: "Items lined up by ascending position.",
  }),
}).annotate({
  identifier: "Receipt",
  description:
    "A saved receipt with trimmed names and normalized decimals; `11.00` comes back as `11`, beauty.",
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
  description: "Most files allowed on the ice at once.",
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
        "Google Drive root with exactly one immediate folder each for `todo`, `processing`, `processed`, and `failed`. Keep all four in the lineup, bud.",
      examples: ["drive-root"],
    }),
  ),
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()).pipe(
    Schema.annotateEncoded({
      description:
        "Destination spreadsheet with a `RAW` sheet carrying store, date, category, item, price, and source file ID in columns A–F.",
      examples: ["sheet-id"],
    }),
  ),
  concurrency: Concurrency.annotateKey({
    description: "Most files processed at once; the HTTP route picks no default for you.",
  }),
}).annotate({
  identifier: "ProcessRequest",
  description:
    "The batch game plan. IDs are trimmed and stay nonempty; the service account needs access to download and move files and update the sheet.",
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
  description: "The shift where processing went sideways.",
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
      "Rows made the sheet and the file reached `processed`; database persistence is not a sure thing.",
  }),
  Schema.TaggedStruct("AlreadyProcessed", File).annotate({
    identifier: "AlreadyProcessed",
    description:
      "The file was already on the scoresheet and moved to `processed`, with no new rows or database write.",
  }),
  Schema.TaggedStruct("Failed", {
    ...File,
    stage: Stage,
    disposition: Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]).annotate({
      description:
        "`MovedToFailed` puts the file in `failed`. `ClaimNotConfirmed` means the opening move failed and the file location is unknown.",
      examples: ["MovedToFailed"],
    }),
  }).annotate({
    identifier: "Failed",
    description: "Processing missed the net; disposition tells you where the file ended up.",
  }),
  Schema.TaggedStruct("Stranded", { ...File, stage: Stage }).annotate({
    identifier: "Stranded",
    description:
      "Processing and the move to `failed` both missed. Find the file by ID before taking another shot.",
  }),
]).annotate({
  identifier: "ReceiptProcessingResult",
  description: "The final whistle for one file; provider diagnostics stay in the room.",
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
