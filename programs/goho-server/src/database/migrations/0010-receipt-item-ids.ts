import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Gives every receipt item a generated BIGINT identity; position stays the
 * unique ordering key within its receipt.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Adding an identity column rewrites the table to fill existing rows without
  // firing UPDATE triggers, so record timestamps keep their history.
  yield* sql`
    ALTER TABLE receipt_items
      ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY
  `;
  yield* sql`
    ALTER TABLE receipt_items
      DROP CONSTRAINT receipt_items_pkey
  `;
  yield* sql`
    ALTER TABLE receipt_items
      ADD CONSTRAINT receipt_items_pkey PRIMARY KEY (id),
      ADD CONSTRAINT receipt_items_receipt_id_position_key UNIQUE (receipt_id, position)
  `;
});
