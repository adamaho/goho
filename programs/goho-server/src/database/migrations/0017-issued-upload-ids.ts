import { Effect } from "effect";
import { SqlClient } from "effect/sql";

import * as QueueConstants from "#src/queues/constants.ts";

/**
 * Records every receipt and book upload ID ever issued, so a retried idempotency
 * key for a deleted upload is recognised instead of creating an upload whose
 * queue job already ran. Rows outlive their uploads and queue history.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE issued_upload_ids (
      kind text NOT NULL CHECK (kind IN ('receipt', 'book')),
      id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, id)
    )
  `;
  yield* sql`
    INSERT INTO issued_upload_ids (kind, id)
    SELECT 'receipt', id FROM receipt_uploads
    UNION ALL
    SELECT 'book', id FROM book_uploads
  `;
  // The queue layer creates its table at startup, so it is absent on a fresh
  // database. Where it exists, its jobs also name uploads deleted before now.
  const queueTable = yield* sql<{ readonly exists: boolean }>`
    SELECT to_regclass(${QueueConstants.tableName}) IS NOT NULL AS exists
  `;
  if (queueTable[0]?.exists === true) {
    yield* sql`
      INSERT INTO issued_upload_ids (kind, id)
      SELECT CASE queue_name WHEN 'receipt-uploads' THEN 'receipt' ELSE 'book' END, id::uuid
      FROM ${sql(QueueConstants.tableName)}
      WHERE queue_name IN ('receipt-uploads', 'book-uploads')
      ON CONFLICT DO NOTHING
    `;
  }
});
