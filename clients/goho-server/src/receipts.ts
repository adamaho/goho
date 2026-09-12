import { Schema } from "effect";

const Name = Schema.Trim.check(Schema.isNonEmpty());

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
);

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
);

/**
 * Exact decimal text accepted by the receipt API.
 *
 * @category models
 * @since 0.1.0
 */
export const DecimalString = Schema.String.check(
  Schema.isPattern(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i),
);

/**
 * Decoded exact decimal text.
 *
 * @category models
 * @since 0.1.0
 */
export type DecimalString = typeof DecimalString.Type;

const ReceiptFields = {
  storeName: Name,
  receiptDate: CalendarDate,
  category: Name,
  subtotal: DecimalString,
  tax: DecimalString,
  total: DecimalString,
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))),
};

const ReceiptItemInput = Schema.Struct({ name: Name, amount: DecimalString });

/**
 * Receipt data accepted by the generic creation endpoint. Array order defines item order.
 *
 * @category models
 * @since 0.1.0
 */
export const CreateReceiptRequest = Schema.Struct({
  ...ReceiptFields,
  items: Schema.NonEmptyArray(ReceiptItemInput),
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
export const ReceiptId = Schema.String.check(Schema.isUUID());

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
      position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      name: Name,
      amount: DecimalString,
    }),
  ),
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
export const Concurrency = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }));

/**
 * Inputs for one synchronous receipt batch.
 *
 * @category models
 * @since 0.1.0
 */
export const ProcessRequest = Schema.Struct({
  rootFolderId: Schema.Trim.check(Schema.isNonEmpty()),
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()),
  concurrency: Concurrency,
});

/**
 * Decoded receipt batch inputs.
 *
 * @category models
 * @since 0.1.0
 */
export interface ProcessRequest extends Schema.Schema.Type<typeof ProcessRequest> {}

const File = { fileId: Schema.String, fileName: Schema.String };
const Stage = Schema.Literals([
  "Claim",
  "ValidateFile",
  "DownloadFile",
  "ParseReceipt",
  "AppendRows",
  "Complete",
]);

/**
 * Public receipt outcomes; diagnostic causes stay on the server.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptProcessingResult = Schema.Union([
  Schema.TaggedStruct("Processed", File),
  Schema.TaggedStruct("AlreadyProcessed", File),
  Schema.TaggedStruct("Failed", {
    ...File,
    stage: Stage,
    disposition: Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]),
  }),
  Schema.TaggedStruct("Stranded", { ...File, stage: Stage }),
]);

/**
 * Decoded public outcome for one receipt.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptProcessingResult = Schema.Schema.Type<typeof ReceiptProcessingResult>;
