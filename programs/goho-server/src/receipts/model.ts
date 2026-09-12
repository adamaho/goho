import { DecimalString } from "@goho/goho-server-client/receipts";
import { Array, Schema } from "effect";

export { DecimalString, ReceiptId } from "@goho/goho-server-client/receipts";

const Name = Schema.Trim.check(Schema.isNonEmpty());

const ReceiptDate = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }

      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const date = new Date(Date.UTC(year, month - 1, day));

      return (
        year >= 2025 &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    {
      expected: "a real calendar date in YYYY-MM-DD format with a year of 2025 or later",
      toJsonSchema: () => ({
        pattern: "^(?:202[5-9]|20[3-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})-\\d{2}-\\d{2}$",
      }),
    },
  ),
);

/**
 * Schema of the validated AI extraction.
 *
 * @category models
 * @since 0.1.0
 */
export const ParsedReceipt = Schema.Struct({
  store: Schema.Struct({
    name: Name,
  }),
  date: ReceiptDate,
  transaction: Schema.Struct({
    items: Schema.NonEmptyArray(
      Schema.Struct({
        name: Name,
        price: Schema.Finite,
      }),
    ),
    category: Name,
    subtotal: Schema.Finite,
    tax: Schema.Finite,
    total: Schema.Finite,
  }),
});

/**
 * Validated receipt extraction.
 *
 * @category models
 * @since 0.1.0
 */
export interface ParsedReceipt extends Schema.Schema.Type<typeof ParsedReceipt> {}

/**
 * Identity of the original receipt file.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptSource = Schema.Struct({
  provider: Schema.Literal("google_drive"),
  fileId: Name,
  fileName: Name,
});
/**
 * Source file metadata for persistence.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptSource extends Schema.Schema.Type<typeof ReceiptSource> {}

/**
 * Receipt and ordered items accepted by the repository.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptToSave = Schema.Struct({
  source: ReceiptSource,
  storeName: Name,
  receiptDate: ReceiptDate,
  category: Name,
  subtotal: DecimalString,
  tax: DecimalString,
  total: DecimalString,
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))),
  extractionVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  extractedPayload: ParsedReceipt,
  items: Schema.NonEmptyArray(
    Schema.Struct({
      position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      name: Name,
      amount: DecimalString,
    }),
  ),
});
/**
 * Normalized receipt persistence input.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptToSave extends Schema.Schema.Type<typeof ReceiptToSave> {}

/**
 * Normalizes a validated extraction for storage and Sheets without rounding.
 * Currency is unknown because the current extraction contract does not supply it.
 *
 * @category models
 * @since 0.1.0
 */
export const prepareReceipt = (parsed: ParsedReceipt, source: ReceiptSource): ReceiptToSave => ({
  source,
  storeName: parsed.store.name,
  receiptDate: parsed.date,
  category: parsed.transaction.category,
  subtotal: DecimalString.make(String(parsed.transaction.subtotal)),
  tax: DecimalString.make(String(parsed.transaction.tax)),
  total: DecimalString.make(String(parsed.transaction.total)),
  currency: null,
  extractionVersion: 1,
  extractedPayload: parsed,
  items: Array.map(parsed.transaction.items, (item, position) => ({
    position,
    name: item.name.replace(/\s+\(\d+\)$/, ""),
    amount: DecimalString.make(String(item.price)),
  })),
});
