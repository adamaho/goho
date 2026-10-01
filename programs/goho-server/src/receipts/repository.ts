import {
  CalendarDate,
  DecimalString,
  Receipt as ReceiptSchema,
  ReceiptId,
  type CreateReceiptRequest,
  type Receipt,
} from "@goho/goho-api/receipts";
import { Array, Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { ReceiptIdFromDatabase } from "#src/schema.ts";

/**
 * Expected failure while reading or saving a receipt.
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
  readonly insert: (receipt: CreateReceiptRequest) => Effect.Effect<ReceiptId, PersistenceError>;
  readonly list: Effect.Effect<ReadonlyArray<Receipt>, PersistenceError>;
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

const ReceiptRow = Schema.Struct({
  id: ReceiptIdFromDatabase,
  store_name: Schema.String,
  receipt_date: CalendarDate,
  category: Schema.String,
  subtotal: DecimalString,
  tax: DecimalString,
  total: DecimalString,
  currency: Schema.String,
});

const ItemRow = Schema.Struct({
  position: Schema.Int,
  name: Schema.String,
  amount: DecimalString,
});

const ReceiptListRow = Schema.Struct({
  ...ReceiptRow.fields,
  item_position: Schema.NullOr(Schema.Int),
  item_name: Schema.NullOr(Schema.String),
  item_amount: Schema.NullOr(DecimalString),
});

const ItemInsertRow = Schema.Struct({
  receipt_id: ReceiptId,
  position: Schema.Int,
  name: Schema.String,
  amount: DecimalString,
});
const decodeReceiptList = Schema.decodeUnknownEffect(Schema.Array(ReceiptSchema));

type ReceiptCandidate = Omit<Receipt, "items"> & {
  readonly items: Array<Receipt["items"][number]>;
};

/**
 * Reads receipts and inserts each receipt with all its items.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const findReceiptRow = SqlSchema.findOneOption({
      Request: ReceiptId,
      Result: ReceiptRow,
      execute: (receiptId) => sql`
        SELECT id, store_name, receipt_date::text, category,
          subtotal::text, tax::text, total::text, currency
        FROM receipts WHERE id = ${receiptId}
      `,
    });

    const findItemRows = SqlSchema.findNonEmpty({
      Request: ReceiptId,
      Result: ItemRow,
      execute: (receiptId) => sql`
        SELECT position, name, amount::text
        FROM receipt_items WHERE receipt_id = ${receiptId} ORDER BY position
      `,
    });

    const insertReceiptRow = SqlSchema.findOne({
      Request: Schema.Struct({
        storeName: Schema.String,
        receiptDate: CalendarDate,
        category: Schema.String,
        subtotal: DecimalString,
        tax: DecimalString,
        total: DecimalString,
        currency: Schema.NullOr(Schema.String),
      }),
      Result: IdRow,
      execute: (receipt) => sql`
        INSERT INTO receipts (
          store_name, receipt_date, category, subtotal, tax, total, currency
        ) VALUES (
          ${receipt.storeName}, ${receipt.receiptDate}, ${receipt.category},
          ${receipt.subtotal}, ${receipt.tax}, ${receipt.total}, ${receipt.currency ?? "CAD"}
        ) RETURNING id
      `,
    });

    const insertItemRows = SqlSchema.void({
      Request: Schema.Array(ItemInsertRow),
      execute: (rows) => sql`INSERT INTO receipt_items ${sql.insert(rows)}`,
    });

    const selectListRows = SqlSchema.findAll({
      Request: Schema.Void,
      Result: ReceiptListRow,
      execute: () => sql`
        SELECT r.id, r.store_name, r.receipt_date::text, r.category,
          r.subtotal::text, r.tax::text, r.total::text, r.currency,
          i.position AS item_position, i.name AS item_name, i.amount::text AS item_amount
        FROM receipts r
        LEFT JOIN receipt_items i ON i.receipt_id = r.id
        ORDER BY r.receipt_date DESC, r.created_at DESC, r.id, i.position
      `,
    });

    const findById = Effect.fn("@goho/ReceiptRepository.findById")(
      function* (receiptId: ReceiptId) {
        const receipt = yield* findReceiptRow(receiptId);
        if (Option.isNone(receipt)) return Option.none();
        const items = yield* findItemRows(receiptId);
        return Option.some({
          id: receipt.value.id,
          storeName: receipt.value.store_name,
          receiptDate: receipt.value.receipt_date,
          category: receipt.value.category,
          subtotal: receipt.value.subtotal,
          tax: receipt.value.tax,
          total: receipt.value.total,
          currency: receipt.value.currency,
          items,
        } satisfies Receipt);
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findById", cause })),
    );
    // Callers may compose this into a larger transaction, where it becomes a savepoint.

    const insert = Effect.fn("@goho/ReceiptRepository.insert")(
      function* (receipt: CreateReceiptRequest) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const { id } = yield* insertReceiptRow(receipt);
            yield* insertItemRows(
              Array.map(receipt.items, (item, position) => ({
                receipt_id: id,
                position,
                name: item.name,
                amount: item.amount,
              })),
            );
            return id;
          }),
        );
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "insert", cause })),
    );

    const list = Effect.gen(function* () {
      const rows = yield* selectListRows(undefined);
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

    return Service.of({ findById, insert, list });
  }),
);
