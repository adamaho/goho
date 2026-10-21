import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Tracks stored book cover scans through background processing. Several
 * successful scans can belong to one book; at most one of them is its cover.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Book deletion removes its uploads first, so the reference needs no cascade
  // and a direct book delete cannot leave stored files untracked.
  yield* sql`
    CREATE TABLE book_uploads (
      id uuid PRIMARY KEY,
      file_id text NOT NULL CHECK (length(btrim(file_id)) > 0),
      file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
      content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
      status text NOT NULL CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
      book_id bigint REFERENCES books(id),
      is_cover boolean NOT NULL DEFAULT false,
      failure_code text CHECK (failure_code IN (
        'storage_failed',
        'processing_failed',
        'book_creation_failed',
        'internal_error'
      )),
      extraction_version integer CHECK (extraction_version > 0),
      extracted_payload jsonb CHECK (jsonb_typeof(extracted_payload) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT book_uploads_outcome_matches_status CHECK (
        (
          status IN ('queued', 'processing') AND book_id IS NULL AND NOT is_cover AND
          failure_code IS NULL AND extraction_version IS NULL AND extracted_payload IS NULL
        ) OR (
          status = 'succeeded' AND book_id IS NOT NULL AND failure_code IS NULL AND
          extraction_version IS NOT NULL AND extracted_payload IS NOT NULL
        ) OR (
          status = 'failed' AND book_id IS NULL AND NOT is_cover AND failure_code IS NOT NULL AND
          extraction_version IS NULL AND extracted_payload IS NULL
        )
      )
    )
  `;
  // One cover per book, chosen when a scan succeeds and kept until the book is deleted.
  yield* sql`CREATE UNIQUE INDEX book_uploads_cover_key ON book_uploads (book_id) WHERE is_cover`;
  yield* sql`CREATE INDEX book_uploads_book_id_idx ON book_uploads (book_id)`;
  yield* sql`CREATE INDEX book_uploads_status_created_at_idx ON book_uploads (status, created_at)`;
  yield* sql`
    CREATE TRIGGER maintain_record_timestamps
    BEFORE UPDATE ON book_uploads
    FOR EACH ROW EXECUTE FUNCTION maintain_record_timestamps()
  `;
});
