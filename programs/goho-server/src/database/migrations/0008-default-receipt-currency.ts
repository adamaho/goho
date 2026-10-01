import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/** Receipt currency applies to every item and total; preserve explicit currencies. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`UPDATE receipts SET currency = 'CAD' WHERE currency IS NULL`;
  yield* sql`
    ALTER TABLE receipts
      ALTER COLUMN currency SET DEFAULT 'CAD',
      ALTER COLUMN currency SET NOT NULL
  `;
});
