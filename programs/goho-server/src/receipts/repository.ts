import { createHash } from "node:crypto";

import type {
  CreateReceiptRequest,
  IdempotencyKey,
  Receipt,
} from "@goho/goho-server-client/receipts";
import {
  CalendarDate,
  CreateReceiptRequest as CreateReceiptRequestSchema,
  DecimalString,
  IdempotencyKey as IdempotencyKeySchema,
  ReceiptId,
} from "@goho/goho-server-client/receipts";
import { Array, BigDecimal, Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { ReceiptToSave } from "./model.ts";

/**
 * Expected failure while validating or saving a receipt.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.ReceiptRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * The same idempotency key was previously used for different receipt data.
 *
 * @category errors
 * @since 0.1.0
 */
export class IdempotencyConflict extends Schema.TaggedError<IdempotencyConflict>()(
  "GohoServer.ReceiptRepository.IdempotencyConflict",
  { idempotencyKey: IdempotencyKeySchema },
) {}

/**
 * Whether the receipt was inserted or already existed.
 *
 * @category models
 * @since 0.1.0
 */
export type SaveResult =
  | { readonly _tag: "Inserted"; readonly receiptId: ReceiptId }
  | { readonly _tag: "AlreadyExists"; readonly receiptId: ReceiptId };

/**
 * Receipt persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly create: (
    idempotencyKey: IdempotencyKey,
    receipt: CreateReceiptRequest,
  ) => Effect.Effect<Receipt, PersistenceError | IdempotencyConflict>;
  readonly save: (receipt: ReceiptToSave) => Effect.Effect<SaveResult, PersistenceError>;
}

/**
 * Receipt persistence; callers decide how failures affect their workflow.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/ReceiptRepository",
) {}

const IdRow = Schema.Struct({ id: ReceiptId });
const decodeInserted = Schema.decodeUnknownEffect(Schema.Array(IdRow));
const decodeExisting = Schema.decodeUnknownEffect(Schema.NonEmptyArray(IdRow));
const ReceiptRow = Schema.Struct({
  id: ReceiptId,
  store_name: Schema.String,
  receipt_date: CalendarDate,
  category: Schema.String,
  subtotal: DecimalString,
  tax: DecimalString,
  total: DecimalString,
  currency: Schema.NullOr(Schema.String),
});
const ItemRow = Schema.Struct({
  position: Schema.Int,
  name: Schema.String,
  amount: DecimalString,
});
const decodeReceiptRow = Schema.decodeUnknownEffect(Schema.NonEmptyArray(ReceiptRow));
const decodeItemRows = Schema.decodeUnknownEffect(Schema.NonEmptyArray(ItemRow));

const canonicalDecimal = (value: typeof DecimalString.Type): typeof DecimalString.Type =>
  DecimalString.make(BigDecimal.format(BigDecimal.normalize(BigDecimal.fromStringUnsafe(value))));

const canonicalize = (receipt: CreateReceiptRequest): CreateReceiptRequest => ({
  storeName: receipt.storeName,
  receiptDate: receipt.receiptDate,
  category: receipt.category,
  subtotal: canonicalDecimal(receipt.subtotal),
  tax: canonicalDecimal(receipt.tax),
  total: canonicalDecimal(receipt.total),
  currency: receipt.currency,
  items: Array.map(receipt.items, (item) => ({
    name: item.name,
    amount: canonicalDecimal(item.amount),
  })),
});

const fingerprint = (receipt: CreateReceiptRequest): Uint8Array =>
  createHash("sha256").update(JSON.stringify(receipt)).digest();

/**
 * Creates or saves each receipt and all its items atomically.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const readReceipt = Effect.fn("@goho/ReceiptRepository.readReceipt")(function* (
      receiptId: typeof ReceiptId.Type,
    ) {
      const receipts = yield* sql`
        SELECT id, store_name, receipt_date::text, category,
          subtotal::text, tax::text, total::text, currency
        FROM receipts WHERE id = ${receiptId}
      `.pipe(Effect.flatMap(decodeReceiptRow));
      const items = yield* sql`
        SELECT position, name, amount::text
        FROM receipt_items WHERE receipt_id = ${receiptId} ORDER BY position
      `.pipe(Effect.flatMap(decodeItemRows));
      const receipt = receipts[0];
      return {
        id: receipt.id,
        storeName: receipt.store_name,
        receiptDate: receipt.receipt_date,
        category: receipt.category,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        total: receipt.total,
        currency: receipt.currency,
        items,
      } satisfies Receipt;
    });
    const create = Effect.fn("@goho/ReceiptRepository.create")(function* (
      idempotencyKey: IdempotencyKey,
      input: CreateReceiptRequest,
    ) {
      const outcome = yield* Effect.gen(function* () {
        const key = yield* Schema.decodeEffect(IdempotencyKeySchema)(idempotencyKey);
        const receipt = canonicalize(yield* Schema.decodeEffect(CreateReceiptRequestSchema)(input));
        const requestFingerprint = fingerprint(receipt);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const inserted = yield* sql`
              INSERT INTO receipts (
                idempotency_key, request_fingerprint, store_name, receipt_date,
                category, subtotal, tax, total, currency
              ) VALUES (
                ${key}, ${requestFingerprint}, ${receipt.storeName}, ${receipt.receiptDate},
                ${receipt.category}, ${receipt.subtotal}, ${receipt.tax}, ${receipt.total},
                ${receipt.currency}
              ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
            `.pipe(Effect.flatMap(decodeInserted));
            const row = inserted.at(0);
            if (row === undefined) {
              const existing = yield* sql`
                SELECT id FROM receipts
                WHERE idempotency_key = ${key} AND request_fingerprint = ${requestFingerprint}
              `.pipe(Effect.flatMap(decodeInserted));
              const existingRow = existing.at(0);
              if (existingRow === undefined) return { _tag: "Conflict" } as const;
              return {
                _tag: "Receipt",
                receipt: yield* readReceipt(existingRow.id),
              } as const;
            }
            yield* sql`INSERT INTO receipt_items ${sql.insert(
              Array.map(receipt.items, (item, position) => ({
                receipt_id: row.id,
                position,
                name: item.name,
                amount: item.amount,
              })),
            )}`;
            return { _tag: "Receipt", receipt: yield* readReceipt(row.id) } as const;
          }),
        );
      }).pipe(Effect.mapError((cause) => new PersistenceError({ operation: "create", cause })));
      if (outcome._tag === "Conflict") {
        return yield* new IdempotencyConflict({ idempotencyKey });
      }
      return outcome.receipt;
    });
    const save = Effect.fn("@goho/ReceiptRepository.save")(
      function* (input: ReceiptToSave): Effect.fn.Return<SaveResult, unknown> {
        const receipt = yield* Schema.decodeEffect(ReceiptToSave)(input);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const inserted = yield* sql`
          INSERT INTO receipts (
            source_provider, source_file_id, source_file_name, store_name, receipt_date,
            category, subtotal, tax, total, currency, extraction_version, extracted_payload
          ) VALUES (
            ${receipt.source.provider}, ${receipt.source.fileId}, ${receipt.source.fileName},
            ${receipt.storeName}, ${receipt.receiptDate}, ${receipt.category},
            ${receipt.subtotal}, ${receipt.tax}, ${receipt.total}, ${receipt.currency},
            ${receipt.extractionVersion}, ${JSON.stringify(receipt.extractedPayload)}::jsonb
          ) ON CONFLICT (source_provider, source_file_id) DO NOTHING RETURNING id
        `.pipe(Effect.flatMap(decodeInserted));
            const row = inserted.at(0);
            if (row === undefined) {
              const existing = yield* sql`
            SELECT id FROM receipts
            WHERE source_provider = ${receipt.source.provider} AND source_file_id = ${receipt.source.fileId}
          `.pipe(Effect.flatMap(decodeExisting));
              return { _tag: "AlreadyExists", receiptId: existing[0].id } satisfies SaveResult;
            }
            yield* sql`INSERT INTO receipt_items ${sql.insert(
              receipt.items.map((item) => ({
                receipt_id: row.id,
                position: item.position,
                name: item.name,
                amount: item.amount,
              })),
            )}`;
            return { _tag: "Inserted", receiptId: row.id } satisfies SaveResult;
          }),
        );
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "save", cause })),
    );
    return Service.of({ create, save });
  }),
);
