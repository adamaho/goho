import { CalendarDate, DecimalString } from "@goho/goho-api/receipts";
import { Array, Schema } from "effect";

import { NonEmptyText } from "#src/schema.ts";

/**
 * Schema of the validated AI extraction.
 *
 * @category models
 * @since 0.1.0
 */
export const ParsedReceipt = Schema.Struct({
  store: Schema.Struct({
    name: NonEmptyText,
  }),
  date: CalendarDate,
  transaction: Schema.Struct({
    items: Schema.NonEmptyArray(
      Schema.Struct({
        name: NonEmptyText,
        price: Schema.Finite,
      }),
    ),
    category: NonEmptyText,
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
  provider: Schema.Literals(["google_drive", "file_storage"]),
  fileId: NonEmptyText,
  fileName: NonEmptyText,
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
  storeName: NonEmptyText,
  receiptDate: CalendarDate,
  category: NonEmptyText,
  subtotal: DecimalString,
  tax: DecimalString,
  total: DecimalString,
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))),
  extractionVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  extractedPayload: ParsedReceipt,
  items: Schema.NonEmptyArray(
    Schema.Struct({
      position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      name: NonEmptyText,
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
