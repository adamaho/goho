import {
  CalendarDate,
  DecimalString,
  Receipt as ReceiptSchema,
  ReceiptId,
  type CreateReceiptRequest,
  type IdempotencyKey,
  type Receipt,
} from "@goho/goho-api/receipts";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { ReceiptIdFromDatabase } from "#src/schema.ts";

import { type ReceiptSource, ReceiptToSave } from "./model.ts";

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
 * Receipt persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly findById: (
    receiptId: ReceiptId,
  ) => Effect.Effect<Option.Option<Receipt>, PersistenceError>;
  readonly list: Effect.Effect<ReadonlyArray<Receipt>, PersistenceError>;
  readonly insertManual: (
    idempotencyKey: IdempotencyKey,
    fingerprint: Uint8Array,
    receipt: Omit<CreateReceiptRequest, "items">,
  ) => Effect.Effect<Option.Option<ReceiptId>, PersistenceError>;
  readonly findByIdempotencyKey: (
    idempotencyKey: IdempotencyKey,
    fingerprint: Uint8Array,
  ) => Effect.Effect<Option.Option<ReceiptId>, PersistenceError>;
  readonly insertExtracted: (
    receipt: Omit<ReceiptToSave, "items">,
  ) => Effect.Effect<Option.Option<ReceiptId>, PersistenceError>;
  readonly findBySource: (source: ReceiptSource) => Effect.Effect<ReceiptId, PersistenceError>;
  readonly insertItems: (
    receiptId: ReceiptId,
    items: ReadonlyArray<Receipt["items"][number]>,
  ) => Effect.Effect<void, PersistenceError>;
}

/**
 * Receipt persistence; callers decide how failures affect their workflow.
 * Callers own transaction boundaries for operations spanning multiple writes.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/ReceiptRepository",
) {}

const IdRow = Schema.Struct({ id: ReceiptIdFromDatabase });
const decodeInserted = Schema.decodeUnknownEffect(Schema.Array(IdRow));
const decodeExisting = Schema.decodeUnknownEffect(Schema.NonEmptyArray(IdRow));
const ReceiptRow = Schema.Struct({
  id: ReceiptIdFromDatabase,
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
const ReceiptListRow = Schema.Struct({
  ...ReceiptRow.fields,
  item_position: Schema.NullOr(Schema.Int),
  item_name: Schema.NullOr(Schema.String),
  item_amount: Schema.NullOr(DecimalString),
});
const decodeReceiptListRows = Schema.decodeUnknownEffect(Schema.Array(ReceiptListRow));
const decodeReceiptList = Schema.decodeUnknownEffect(Schema.Array(ReceiptSchema));

type ReceiptCandidate = Omit<Receipt, "items"> & {
  readonly items: Array<Receipt["items"][number]>;
};

/**
 * Retrieves receipts and performs individual database writes.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const readReceipt = Effect.fn("@goho/ReceiptRepository.readReceipt")(function* (
      receiptId: ReceiptId,
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
    const findById = Effect.fn("@goho/ReceiptRepository.findById")(
      function* (receiptId: ReceiptId) {
        const rows = yield* sql`SELECT id FROM receipts WHERE id = ${receiptId}`.pipe(
          Effect.flatMap(decodeInserted),
        );
        const row = rows.at(0);
        return row === undefined ? Option.none() : Option.some(yield* readReceipt(row.id));
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findById", cause })),
    );
    const list = Effect.gen(function* () {
      const rows = yield* sql`
          SELECT r.id, r.store_name, r.receipt_date::text, r.category,
            r.subtotal::text, r.tax::text, r.total::text, r.currency,
            i.position AS item_position, i.name AS item_name, i.amount::text AS item_amount
          FROM receipts r
          LEFT JOIN receipt_items i ON i.receipt_id = r.id
          ORDER BY r.receipt_date DESC, r.created_at DESC, r.id, i.position
        `.pipe(Effect.flatMap(decodeReceiptListRows));
      const receipts = new Map<ReceiptId, ReceiptCandidate>();
      for (const row of rows) {
        let receipt = receipts.get(row.id);
        if (receipt === undefined) {
          receipt = {
            id: row.id,
            storeName: row.store_name,
            receiptDate: row.receipt_date,
            category: row.category,
            subtotal: row.subtotal,
            tax: row.tax,
            total: row.total,
            currency: row.currency,
            items: [],
          };
          receipts.set(row.id, receipt);
        }
        if (row.item_position !== null && row.item_name !== null && row.item_amount !== null) {
          receipt.items.push({
            position: row.item_position,
            name: row.item_name,
            amount: row.item_amount,
          });
        }
      }
      return yield* decodeReceiptList([...receipts.values()]);
    }).pipe(
      Effect.mapError((cause) => new PersistenceError({ operation: "list", cause })),
      Effect.withSpan("@goho/ReceiptRepository.list"),
    );
    const insertManual = Effect.fn("@goho/ReceiptRepository.insertManual")(
      function* (
        idempotencyKey: IdempotencyKey,
        fingerprint: Uint8Array,
        receipt: Omit<CreateReceiptRequest, "items">,
      ) {
        const inserted = yield* sql`
          INSERT INTO receipts (
            idempotency_key, fingerprint, store_name, receipt_date,
            category, subtotal, tax, total, currency
          ) VALUES (
            ${idempotencyKey}, ${fingerprint}, ${receipt.storeName}, ${receipt.receiptDate},
            ${receipt.category}, ${receipt.subtotal}, ${receipt.tax}, ${receipt.total},
            ${receipt.currency}
          ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
        `.pipe(Effect.flatMap(decodeInserted));
        return Option.fromNullishOr(inserted.at(0)?.id);
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "insertManual", cause })),
    );
    const findByIdempotencyKey = Effect.fn("@goho/ReceiptRepository.findByIdempotencyKey")(
      function* (idempotencyKey: IdempotencyKey, fingerprint: Uint8Array) {
        const rows = yield* sql`
          SELECT id FROM receipts
          WHERE idempotency_key = ${idempotencyKey} AND fingerprint = ${fingerprint}
        `.pipe(Effect.flatMap(decodeInserted));
        return Option.fromNullishOr(rows.at(0)?.id);
      },
      Effect.mapError(
        (cause) => new PersistenceError({ operation: "findByIdempotencyKey", cause }),
      ),
    );
    const insertExtracted = Effect.fn("@goho/ReceiptRepository.insertExtracted")(
      function* (receipt: Omit<ReceiptToSave, "items">) {
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
        return Option.fromNullishOr(inserted.at(0)?.id);
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "insertExtracted", cause })),
    );
    const findBySource = Effect.fn("@goho/ReceiptRepository.findBySource")(
      function* (source: ReceiptSource) {
        const rows = yield* sql`
          SELECT id FROM receipts
          WHERE source_provider = ${source.provider} AND source_file_id = ${source.fileId}
        `.pipe(Effect.flatMap(decodeExisting));
        return rows[0].id;
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findBySource", cause })),
    );
    const insertItems = Effect.fn("@goho/ReceiptRepository.insertItems")(
      function* (receiptId: ReceiptId, items: ReadonlyArray<Receipt["items"][number]>) {
        yield* sql`INSERT INTO receipt_items ${sql.insert(
          items.map((item) => ({
            receipt_id: receiptId,
            position: item.position,
            name: item.name,
            amount: item.amount,
          })),
        )}`;
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "insertItems", cause })),
    );
    return Service.of({
      findById,
      list,
      insertManual,
      findByIdempotencyKey,
      insertExtracted,
      findBySource,
      insertItems,
    });
  }),
);
