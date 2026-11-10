import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Moves a book's cover from a flag on one of its uploads to the book itself:
 * the stored file and its MIME type, both set or both null. Each book whose
 * upload was marked as its cover gets that upload's file; other books get none.
 * Every book keeps its ID, values and timestamps, and every upload keeps its
 * file, extraction and timestamps.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE books
      ADD COLUMN image_file_id text CHECK (length(btrim(image_file_id)) > 0),
      ADD COLUMN image_content_type text CHECK (
        image_content_type IN ('image/jpeg', 'image/png', 'image/webp')
      ),
      ADD CONSTRAINT books_image_complete CHECK (
        (image_file_id IS NULL) = (image_content_type IS NULL)
      )
  `;

  // The backfill is not an edit, so it keeps every timestamp.
  yield* sql`ALTER TABLE books DISABLE TRIGGER maintain_record_timestamps`;
  yield* sql`
    UPDATE books b SET image_file_id = u.file_id, image_content_type = u.content_type
    FROM book_uploads u WHERE u.book_id = b.id AND u.is_cover
  `;
  yield* sql`ALTER TABLE books ENABLE TRIGGER maintain_record_timestamps`;

  // The outcome check is rebuilt under its name without the flag; no statement
  // updates an upload.
  yield* sql`DROP INDEX book_uploads_cover_key`;
  yield* sql`
    ALTER TABLE book_uploads
      DROP CONSTRAINT book_uploads_outcome_matches_status,
      DROP COLUMN is_cover,
      ADD CONSTRAINT book_uploads_outcome_matches_status CHECK (
        (
          status IN ('queued', 'processing') AND book_id IS NULL AND failure_code IS NULL AND
          extraction_version IS NULL AND extracted_payload IS NULL
        ) OR (
          status = 'succeeded' AND book_id IS NOT NULL AND failure_code IS NULL AND
          extraction_version IS NOT NULL AND extracted_payload IS NOT NULL
        ) OR (
          status = 'failed' AND book_id IS NULL AND failure_code IS NOT NULL AND
          extraction_version IS NULL AND extracted_payload IS NULL
        )
      )
  `;
});
