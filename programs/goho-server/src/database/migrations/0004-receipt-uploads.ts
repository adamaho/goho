import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Tracks stored receipt files through background processing.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE receipt_uploads (
      id uuid PRIMARY KEY,
      storage_key text NOT NULL CHECK (length(btrim(storage_key)) > 0),
      file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
      content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
      status text NOT NULL CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
      receipt_id bigint UNIQUE REFERENCES receipts(id),
      failure_code text CHECK (failure_code IN (
        'unsupported_file_type',
        'storage_failed',
        'processing_failed',
        'receipt_creation_failed',
        'internal_error'
      )),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT receipt_uploads_outcome_matches_status CHECK (
        (status IN ('queued', 'processing') AND receipt_id IS NULL AND failure_code IS NULL) OR
        (status = 'succeeded' AND receipt_id IS NOT NULL AND failure_code IS NULL) OR
        (status = 'failed' AND receipt_id IS NULL AND failure_code IS NOT NULL)
      )
    )
  `;
  yield* sql`CREATE INDEX receipt_uploads_status_created_at_idx ON receipt_uploads (status, created_at)`;
});
