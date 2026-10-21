import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Adds the shared list of unique books. A book's identity is its title and
 * author compared case-insensitively with whitespace trimmed and collapsed; the
 * display spelling is stored as entered.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // The one definition of identity text, shared by the unique key and searches.
  yield* sql`
    CREATE FUNCTION book_identity_text(value text)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')))
    $$
  `;
  yield* sql`
    CREATE TABLE books (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title text NOT NULL CHECK (book_identity_text(title) <> ''),
      author text NOT NULL CHECK (book_identity_text(author) <> ''),
      title_key text NOT NULL GENERATED ALWAYS AS (book_identity_text(title)) STORED,
      author_key text NOT NULL GENERATED ALWAYS AS (book_identity_text(author)) STORED,
      category_id bigint NOT NULL REFERENCES categories(id),
      reading_level text CHECK (btrim(reading_level) <> ''),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT books_identity_key UNIQUE (title_key, author_key)
    )
  `;
  yield* sql`CREATE INDEX books_category_id_idx ON books (category_id)`;
  yield* sql`
    CREATE TRIGGER maintain_record_timestamps
    BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION maintain_record_timestamps()
  `;
});
