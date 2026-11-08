import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Adds saved recipes and their imports. A recipe stands alone; an upload tracks
 * one import through background processing and points at the recipe it saved.
 * Each upload's source lives in its own table, so other sources can be added
 * beside public URLs later.
 *
 * The database checks only the top-level shape of a recipe's JSON. The API
 * schemas validate ingredients, steps, yield and the references between them.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // The photo is a stored file, so its ID and content type are set and cleared together.
  yield* sql`
    CREATE TABLE recipes (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title text NOT NULL CHECK (length(btrim(title)) > 0),
      ingredients jsonb NOT NULL CHECK (
        jsonb_typeof(ingredients) = 'array' AND ingredients <> '[]'::jsonb
      ),
      steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND steps <> '[]'::jsonb),
      "yield" jsonb CHECK (jsonb_typeof("yield") = 'object'),
      total_time_seconds integer CHECK (total_time_seconds >= 0),
      image_file_id text CHECK (length(btrim(image_file_id)) > 0),
      image_content_type text CHECK (
        image_content_type IN ('image/jpeg', 'image/png', 'image/webp')
      ),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT recipes_image_complete CHECK (
        (image_file_id IS NULL) = (image_content_type IS NULL)
      )
    )
  `;
  // Recipe deletion removes its upload first, so the reference needs no cascade
  // and a direct recipe delete cannot leave an import pointing nowhere.
  yield* sql`
    CREATE TABLE recipe_uploads (
      id uuid PRIMARY KEY,
      status text NOT NULL CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
      recipe_id bigint UNIQUE REFERENCES recipes(id),
      failure_code text CHECK (failure_code IN (
        'page_unavailable',
        'no_recipe_found',
        'ambiguous_recipe',
        'incomplete_recipe',
        'processing_failed',
        'recipe_creation_failed',
        'internal_error'
      )),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT recipe_uploads_outcome_matches_status CHECK (
        (status IN ('queued', 'processing') AND recipe_id IS NULL AND failure_code IS NULL) OR
        (status = 'succeeded' AND recipe_id IS NOT NULL AND failure_code IS NULL) OR
        (status = 'failed' AND recipe_id IS NULL AND failure_code IS NOT NULL)
      )
    )
  `;
  yield* sql`CREATE INDEX recipe_uploads_status_created_at_idx ON recipe_uploads (status, created_at)`;
  // A URL source has no file and belongs to its upload, so it goes with it. The
  // unique normalized URL makes concurrent imports of one page share an upload
  // until that upload is deleted. The byte limits keep the unique key well
  // inside a btree entry.
  yield* sql`
    CREATE TABLE recipe_upload_urls (
      upload_id uuid PRIMARY KEY REFERENCES recipe_uploads(id) ON DELETE CASCADE,
      url text NOT NULL CHECK (length(btrim(url)) > 0 AND octet_length(url) <= 2048),
      normalized_url text NOT NULL CHECK (
        length(btrim(normalized_url)) > 0 AND octet_length(normalized_url) <= 2048
      ),
      CONSTRAINT recipe_upload_urls_normalized_url_key UNIQUE (normalized_url)
    )
  `;
  for (const table of ["recipes", "recipe_uploads"]) {
    yield* sql`
      CREATE TRIGGER maintain_record_timestamps
      BEFORE UPDATE ON ${sql(table)}
      FOR EACH ROW EXECUTE FUNCTION maintain_record_timestamps()
    `;
  }
});
