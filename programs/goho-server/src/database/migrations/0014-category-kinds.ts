import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Gives every category a nonempty set of the domains it applies to. Existing
 * categories become receipt categories without changing timestamps, and fiction
 * and nonfiction are seeded for books, reusing same-named existing categories.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TYPE category_kind AS ENUM ('receipt', 'book')`;

  // A kind set is stored once per kind in enum order, so every read returns the
  // same order. CHECK constraints cannot hold subqueries, hence the functions.
  yield* sql`
    CREATE FUNCTION category_kinds_with(kinds category_kind[], kind category_kind)
    RETURNS category_kind[] LANGUAGE sql IMMUTABLE AS $$
      SELECT ARRAY(SELECT DISTINCT k FROM unnest(array_append(kinds, kind)) AS k ORDER BY k)
    $$
  `;
  yield* sql`
    CREATE FUNCTION category_kinds_valid(kinds category_kind[])
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT coalesce(
        cardinality(kinds) > 0
          AND array_position(kinds, NULL) IS NULL
          AND kinds = ARRAY(SELECT DISTINCT k FROM unnest(kinds) AS k ORDER BY k),
        false
      )
    $$
  `;
  // Adding a column with a constant default rewrites no rows and fires no update
  // triggers, so existing categories keep their timestamps.
  yield* sql`
    ALTER TABLE categories
      ADD COLUMN kinds category_kind[] NOT NULL DEFAULT '{receipt}'
        CONSTRAINT categories_kinds_check CHECK (category_kinds_valid(kinds))
  `;

  // Seeding is not an edit: an existing fiction or nonfiction category keeps its
  // ID, metadata and timestamps and also becomes a book category.
  yield* sql`ALTER TABLE categories DISABLE TRIGGER maintain_record_timestamps`;
  yield* sql`
    INSERT INTO categories (name, kinds) VALUES ('fiction', '{book}'), ('nonfiction', '{book}')
    ON CONFLICT (name) DO UPDATE
      SET kinds = category_kinds_with(categories.kinds, 'book')
  `;
  yield* sql`ALTER TABLE categories ENABLE TRIGGER maintain_record_timestamps`;
});
