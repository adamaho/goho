import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Groups each recipe's steps into sections. Every saved recipe becomes one
 * untitled section holding its steps exactly as stored, so IDs, other values,
 * photos, sources and timestamps stay. As before, the database checks only
 * that `sections` is a nonempty JSON array; the API schemas validate the rest.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE recipes ADD COLUMN sections jsonb`;

  // The backfill is not an edit, so it keeps every timestamp.
  yield* sql`ALTER TABLE recipes DISABLE TRIGGER maintain_record_timestamps`;
  yield* sql`
    UPDATE recipes
    SET sections = jsonb_build_array(jsonb_build_object('title', null, 'steps', steps))
  `;
  yield* sql`ALTER TABLE recipes ENABLE TRIGGER maintain_record_timestamps`;

  // Dropping the column drops its check with it.
  yield* sql`
    ALTER TABLE recipes
      DROP COLUMN steps,
      ALTER COLUMN sections SET NOT NULL,
      ADD CONSTRAINT recipes_sections_check CHECK (
        jsonb_typeof(sections) = 'array' AND sections <> '[]'::jsonb
      )
  `;
});
