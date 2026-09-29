import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Moves extraction results onto the upload that produced them and removes source
 * metadata from receipts, so receipts hold only receipt data. Receipts from the
 * retired Google Drive source keep their data but lose their provenance.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE receipt_uploads
      ADD COLUMN extraction_version integer CHECK (extraction_version > 0),
      ADD COLUMN extracted_payload jsonb CHECK (jsonb_typeof(extracted_payload) = 'object')
  `;
  yield* sql`
    UPDATE receipt_uploads AS upload
    SET extraction_version = receipt.extraction_version,
      extracted_payload = receipt.extracted_payload
    FROM receipts AS receipt
    WHERE upload.receipt_id = receipt.id
  `;
  yield* sql`
    ALTER TABLE receipt_uploads
      DROP CONSTRAINT receipt_uploads_outcome_matches_status,
      ADD CONSTRAINT receipt_uploads_outcome_matches_status CHECK (
        (
          status IN ('queued', 'processing') AND receipt_id IS NULL AND failure_code IS NULL AND
          extraction_version IS NULL AND extracted_payload IS NULL
        ) OR (
          status = 'succeeded' AND receipt_id IS NOT NULL AND failure_code IS NULL AND
          extraction_version IS NOT NULL AND extracted_payload IS NOT NULL
        ) OR (
          status = 'failed' AND receipt_id IS NULL AND failure_code IS NOT NULL AND
          extraction_version IS NULL AND extracted_payload IS NULL
        )
      )
  `;
  yield* sql`
    ALTER TABLE receipts
      DROP CONSTRAINT receipts_source_complete,
      DROP COLUMN source_provider,
      DROP COLUMN source_file_id,
      DROP COLUMN source_file_name,
      DROP COLUMN extraction_version,
      DROP COLUMN extracted_payload
  `;
});
