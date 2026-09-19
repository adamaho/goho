import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Replaces UUID receipt identities with database-generated BIGINT identities.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE receipts
      ADD COLUMN bigint_id bigint
  `;
  yield* sql`
    WITH numbered AS (
      SELECT id, row_number() OVER (ORDER BY created_at, id)::bigint AS bigint_id
      FROM receipts
    )
    UPDATE receipts AS receipt
    SET bigint_id = numbered.bigint_id
    FROM numbered
    WHERE receipt.id = numbered.id
  `;
  yield* sql`
    ALTER TABLE receipts
      ALTER COLUMN bigint_id SET NOT NULL,
      ALTER COLUMN bigint_id ADD GENERATED ALWAYS AS IDENTITY
  `;
  yield* sql`
    SELECT setval(
      pg_get_serial_sequence('receipts', 'bigint_id'),
      COALESCE(max(bigint_id), 1),
      max(bigint_id) IS NOT NULL
    )
    FROM receipts
  `;
  yield* sql`
    ALTER TABLE receipt_items
      ADD COLUMN bigint_receipt_id bigint
  `;
  yield* sql`
    UPDATE receipt_items AS item
    SET bigint_receipt_id = receipt.bigint_id
    FROM receipts AS receipt
    WHERE item.receipt_id = receipt.id
  `;
  yield* sql`
    ALTER TABLE receipt_items
      ALTER COLUMN bigint_receipt_id SET NOT NULL,
      DROP CONSTRAINT receipt_items_receipt_id_fkey,
      DROP CONSTRAINT receipt_items_receipt_id_position_key,
      DROP CONSTRAINT receipt_items_pkey,
      DROP COLUMN id,
      DROP COLUMN receipt_id
  `;
  yield* sql`
    ALTER TABLE receipts
      DROP CONSTRAINT receipts_pkey,
      DROP COLUMN id
  `;
  yield* sql`
    ALTER TABLE receipts
      RENAME COLUMN bigint_id TO id
  `;
  yield* sql`
    ALTER SEQUENCE receipts_bigint_id_seq
      RENAME TO receipts_id_seq
  `;
  yield* sql`
    ALTER TABLE receipt_items
      RENAME COLUMN bigint_receipt_id TO receipt_id
  `;
  yield* sql`
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_pkey PRIMARY KEY (id)
  `;
  yield* sql`
    ALTER TABLE receipt_items
      ADD CONSTRAINT receipt_items_pkey PRIMARY KEY (receipt_id, position),
      ADD CONSTRAINT receipt_items_receipt_id_fkey
        FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
  `;
});
