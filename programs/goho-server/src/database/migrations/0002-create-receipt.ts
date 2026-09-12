import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Adds API-created receipts without inventing Google Drive provenance.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE receipts
      ALTER COLUMN source_provider DROP NOT NULL,
      ALTER COLUMN source_file_id DROP NOT NULL,
      ALTER COLUMN source_file_name DROP NOT NULL,
      ALTER COLUMN extraction_version DROP NOT NULL,
      ALTER COLUMN extracted_payload DROP NOT NULL,
      ADD COLUMN idempotency_key text,
      ADD COLUMN request_fingerprint bytea,
      ADD CONSTRAINT receipts_source_complete CHECK (
        (
          source_provider IS NULL AND
          source_file_id IS NULL AND
          source_file_name IS NULL AND
          extraction_version IS NULL AND
          extracted_payload IS NULL
        ) OR (
          source_provider IS NOT NULL AND
          source_file_id IS NOT NULL AND
          source_file_name IS NOT NULL AND
          extraction_version IS NOT NULL AND
          extracted_payload IS NOT NULL
        )
      ),
      ADD CONSTRAINT receipts_idempotency_complete CHECK (
        (idempotency_key IS NULL) = (request_fingerprint IS NULL)
      ),
      ADD CONSTRAINT receipts_idempotency_key_nonempty CHECK (
        idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0
      ),
      ADD CONSTRAINT receipts_request_fingerprint_sha256 CHECK (
        request_fingerprint IS NULL OR octet_length(request_fingerprint) = 32
      ),
      ADD CONSTRAINT receipts_idempotency_key_unique UNIQUE (idempotency_key)
  `;
});
