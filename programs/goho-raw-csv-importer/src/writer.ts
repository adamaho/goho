import { Array, Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";

import type { PlannedReceipt } from "./plan.ts";

/**
 * The import transaction failed and was rolled back; nothing was written.
 *
 * @category errors
 * @since 0.1.0
 */
export class WriteError extends Schema.TaggedError<WriteError>()("RawCsvImporter.WriteError", {
  cause: Schema.Defect(),
}) {}

/**
 * Counts committed by one apply.
 *
 * @category models
 * @since 0.1.0
 */
export interface Inserted {
  readonly receipts: number;
  readonly items: number;
}

const IdRow = Schema.Struct({ id: Schema.String });
const decodeIdRows = Schema.decodeUnknownEffect(Schema.Tuple([IdRow]));

/**
 * Inserts every planned receipt and its ordered items in one transaction.
 * Every call creates new receipts; there is no deduplication. Database
 * defaults assign IDs and record timestamps, and no uploads are created.
 *
 * @category persistence
 * @since 0.1.0
 */
export const insertReceipts = Effect.fn("@goho/RawCsvImporter.insertReceipts")(
  function* (receipts: ReadonlyArray<PlannedReceipt>) {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let items = 0;
        for (const receipt of receipts) {
          const [{ id }] = yield* sql`
            INSERT INTO receipts (
              store_name, receipt_date, category, subtotal, tax, total, currency
            ) VALUES (
              ${receipt.storeName}, ${receipt.receiptDate}, ${receipt.category},
              ${receipt.subtotal}, ${receipt.tax}, ${receipt.total}, ${receipt.currency}
            ) RETURNING id::text AS id
          `.pipe(Effect.flatMap(decodeIdRows));
          yield* sql`INSERT INTO receipt_items ${sql.insert(
            Array.map(receipt.items, (item, position) => ({
              receipt_id: id,
              position,
              name: item.name,
              amount: item.amount,
            })),
          )}`;
          items += receipt.items.length;
        }
        return { receipts: receipts.length, items } satisfies Inserted;
      }),
    );
  },
  Effect.mapError((cause) => new WriteError({ cause })),
);
