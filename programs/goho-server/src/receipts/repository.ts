import {
  CalendarDate,
  CreateReceiptRequest as CreateReceiptRequestSchema,
  DecimalString,
  Receipt as ReceiptSchema,
  ReceiptId,
  type CreateReceiptRequest,
  type Receipt,
} from "@goho/goho-api/receipts";
import { Array, BigDecimal, Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { ReceiptIdFromDatabase } from "#src/schema.ts";

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
  readonly findById: (
    receiptId: ReceiptId,
  ) => Effect.Effect<Option.Option<Receipt>, PersistenceError>;
  readonly list: Effect.Effect<ReadonlyArray<Receipt>, PersistenceError>;
  readonly create: (receipt: CreateReceiptRequest) => Effect.Effect<Receipt, PersistenceError>;
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

const normalizeDecimal = (value: DecimalString) =>
  DecimalString.make(BigDecimal.format(BigDecimal.normalize(BigDecimal.fromStringUnsafe(value))));

const normalizeReceipt = (receipt: CreateReceiptRequest) => ({
  storeName: receipt.storeName,
  receiptDate: receipt.receiptDate,
  category: receipt.category,
  subtotal: normalizeDecimal(receipt.subtotal),
  tax: normalizeDecimal(receipt.tax),
  total: normalizeDecimal(receipt.total),
  currency: receipt.currency,
  items: Array.map(receipt.items, (item) => ({
    name: item.name,
    amount: normalizeDecimal(item.amount),
  })),
});

/**
 * Retrieves receipts and creates or saves each receipt with all its items.
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
    const create = Effect.fn("@goho/ReceiptRepository.create")(
      function* (input: CreateReceiptRequest) {
        const receipt = normalizeReceipt(
          yield* Schema.decodeEffect(CreateReceiptRequestSchema)(input),
        );
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const inserted = yield* sql`
              INSERT INTO receipts (
                store_name, receipt_date, category, subtotal, tax, total, currency
              ) VALUES (
                ${receipt.storeName}, ${receipt.receiptDate}, ${receipt.category},
                ${receipt.subtotal}, ${receipt.tax}, ${receipt.total}, ${receipt.currency}
              ) RETURNING id
            `.pipe(Effect.flatMap(decodeExisting));
            const receiptId = inserted[0].id;
            yield* sql`INSERT INTO receipt_items ${sql.insert(
              Array.map(receipt.items, (item, position) => ({
                receipt_id: receiptId,
                position,
                name: item.name,
                amount: item.amount,
              })),
            )}`;
            return yield* readReceipt(receiptId);
          }),
        );
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "create", cause })),
    );
    const save = Effect.fn("@goho/ReceiptRepository.save")(
      function* (input: ReceiptToSave) {
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
    return Service.of({ create, findById, list, save });
  }),
);
