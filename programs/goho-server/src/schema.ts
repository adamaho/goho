import { ReceiptId, ReceiptItemId } from "@goho/goho-api/receipts";
import { Schema, SchemaGetter } from "effect";

/**
 * Trimmed text containing at least one character.
 *
 * @category models
 * @since 0.1.0
 */
export const NonEmptyText = Schema.Trim.check(Schema.isNonEmpty());

/**
 * Converts PostgreSQL's native BIGINT representation into the API's safe string ID.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptIdFromDatabase = Schema.BigInt.pipe(
  Schema.decodeTo(ReceiptId, {
    decode: SchemaGetter.transform(String),
    encode: SchemaGetter.transform(BigInt),
  }),
);

/**
 * Converts PostgreSQL's native BIGINT representation into the API's safe string item ID.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptItemIdFromDatabase = Schema.BigInt.pipe(
  Schema.decodeTo(ReceiptItemId, {
    decode: SchemaGetter.transform(String),
    encode: SchemaGetter.transform(BigInt),
  }),
);
