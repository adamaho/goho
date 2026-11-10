import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Gives each submission its own import and makes the saved recipe, not the
 * import, the identity of a page. Several imports can now share a page and
 * link one recipe. A recipe imported from a page keeps the URL its first
 * import submitted as its source, and that URL's normalized form as a unique
 * key; a recipe saved directly has neither.
 *
 * Each recipe saved by an import gets that import's URL and normalized URL,
 * unique under migration 0019's constraints. Other rows keep their values, and
 * every row keeps its ID and timestamps.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE recipe_uploads DROP CONSTRAINT recipe_uploads_recipe_id_key`;
  yield* sql`CREATE INDEX recipe_uploads_recipe_id_idx ON recipe_uploads (recipe_id)`;
  // The byte limits keep the unique key well inside a btree entry. Unique keys
  // are distinct from nulls, so direct recipes never conflict.
  yield* sql`
    ALTER TABLE recipes
      ADD COLUMN source_url text CONSTRAINT recipes_source_url_check CHECK (
        length(btrim(source_url)) > 0 AND octet_length(source_url) <= 2048
      ),
      ADD COLUMN normalized_url text CONSTRAINT recipes_normalized_url_check CHECK (
        length(btrim(normalized_url)) > 0 AND octet_length(normalized_url) <= 2048
      ),
      ADD CONSTRAINT recipes_normalized_url_key UNIQUE (normalized_url),
      ADD CONSTRAINT recipes_source_complete CHECK (
        (source_url IS NULL) = (normalized_url IS NULL)
      )
  `;

  // The backfill is not an edit, so it keeps every timestamp.
  yield* sql`ALTER TABLE recipes DISABLE TRIGGER maintain_record_timestamps`;
  yield* sql`
    UPDATE recipes r SET source_url = src.url, normalized_url = src.normalized_url
    FROM recipe_uploads u JOIN recipe_upload_urls src ON src.upload_id = u.id
    WHERE u.recipe_id = r.id
  `;
  yield* sql`ALTER TABLE recipes ENABLE TRIGGER maintain_record_timestamps`;

  // Only the recipe's key identifies a page now. Dropping the column drops its
  // unique key and check with it.
  yield* sql`ALTER TABLE recipe_upload_urls DROP COLUMN normalized_url`;
});
