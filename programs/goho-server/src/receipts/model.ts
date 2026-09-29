import { CalendarDate, type CreateReceiptRequest, DecimalString } from "@goho/goho-api/receipts";
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
 * Version of the extraction contract recorded with each processed upload.
 *
 * @category constants
 * @since 0.1.0
 */
export const extractionVersion = 1;

/**
 * Converts a validated extraction into receipt data without rounding amounts.
 * Currency is unknown because the current extraction contract does not supply it.
 *
 * @category models
 * @since 0.1.0
 */
export const prepareReceipt = (parsed: ParsedReceipt): CreateReceiptRequest => ({
  storeName: parsed.store.name,
  receiptDate: parsed.date,
  category: parsed.transaction.category,
  subtotal: DecimalString.make(String(parsed.transaction.subtotal)),
  tax: DecimalString.make(String(parsed.transaction.tax)),
  total: DecimalString.make(String(parsed.transaction.total)),
  currency: null,
  items: Array.map(parsed.transaction.items, (item) => ({
    name: item.name.replace(/\s+\(\d+\)$/, ""),
    amount: DecimalString.make(String(item.price)),
  })),
});
