import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Names the stored file reference consistently with the FileStorage service.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE receipt_uploads RENAME COLUMN storage_key TO file_id`;
});
