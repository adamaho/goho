import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { ReceiptId, ReceiptToSave } from "./model.ts";

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

/**
 * Saves each receipt and all its items atomically. The first successful save wins.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const save = Effect.fn("ReceiptRepository.save")(
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
    return Service.of({ save });
  }),
);
