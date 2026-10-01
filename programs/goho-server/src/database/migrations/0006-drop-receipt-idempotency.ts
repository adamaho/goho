import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Removes idempotency keys from API-created receipts; every create saves a new receipt.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE receipts
      DROP CONSTRAINT receipts_idempotency_key_unique,
      DROP CONSTRAINT receipts_idempotency_complete,
      DROP COLUMN idempotency_key,
      DROP COLUMN fingerprint
  `;
});
