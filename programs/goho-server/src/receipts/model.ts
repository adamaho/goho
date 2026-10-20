import { CalendarDate, CreateReceiptRequest, DecimalString } from "@goho/goho-api/receipts";
import { Array, Schema } from "effect";

import { NonEmptyText } from "#src/schema.ts";

/**
 * Extraction schema whose item categories decode with `category`. Extraction
 * restricts it to the current catalog names.
 *
 * @category models
 * @since 0.1.0
 */
export const parsedReceiptWith = <Category extends Schema.Codec<string, string>>(
  category: Category,
) =>
  Schema.Struct({
    store: Schema.Struct({
      name: NonEmptyText,
    }),
    date: CalendarDate,
    transaction: Schema.Struct({
      currency: CreateReceiptRequest.fields.currency,
      items: Schema.NonEmptyArray(
        Schema.Struct({
          name: NonEmptyText,
          price: Schema.Finite,
          category,
        }),
      ),
      subtotal: Schema.Finite,
      tax: Schema.Finite,
      total: Schema.Finite,
    }),
  });

/**
 * Schema of a validated AI extraction, as stored with its upload.
 *
 * @category models
 * @since 0.1.0
 */
export const ParsedReceipt = parsedReceiptWith(NonEmptyText);

/**
 * Validated receipt extraction.
 *
 * @category models
 * @since 0.1.0
 */
export interface ParsedReceipt extends Schema.Schema.Type<typeof ParsedReceipt> {}

/**
 * Version of the extraction contract recorded with each processed upload.
 * Version 2 moved the category from the transaction to each item; version 1
 * payloads stay as recorded.
 *
 * @category constants
 * @since 0.1.0
 */
export const extractionVersion = 2;

/**
 * Converts a validated extraction into receipt data without rounding amounts.
 *
 * @category models
 * @since 0.1.0
 */
export const prepareReceipt = (parsed: ParsedReceipt): CreateReceiptRequest => ({
  storeName: parsed.store.name,
  receiptDate: parsed.date,
  subtotal: DecimalString.make(String(parsed.transaction.subtotal)),
  tax: DecimalString.make(String(parsed.transaction.tax)),
  total: DecimalString.make(String(parsed.transaction.total)),
  currency: parsed.transaction.currency,
  items: Array.map(parsed.transaction.items, (item) => ({
    name: item.name.replace(/\s+\(\d+\)$/, ""),
    amount: DecimalString.make(String(item.price)),
    category: item.category,
  })),
});
