import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Lets a book's author be unknown. A null author has a null `author_key`, and
 * the identity key treats null keys as equal, so a title without an author is
 * still one book, distinct from the same title with a known author. Existing
 * rows keep their values and timestamps.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Rebuilding the key under its old name keeps the insert's ON CONFLICT target
  // and the repository's conflict mapping. Neither statement updates any row.
  yield* sql`
    ALTER TABLE books
      ALTER COLUMN author DROP NOT NULL,
      ALTER COLUMN author_key DROP NOT NULL,
      DROP CONSTRAINT books_identity_key,
      ADD CONSTRAINT books_identity_key UNIQUE NULLS NOT DISTINCT (title_key, author_key)
  `;
});
