import {
  CreateRecipeRequest,
  normalizeRecipeUrl,
  Recipe,
  RecipeId,
  RecipeSummary,
  type RecipeUrl,
} from "@goho/goho-api/recipes";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { FileId } from "#src/services/file-storage.ts";

import { RecipeImage } from "./model.ts";

/**
 * Expected failure while reading, saving or deleting recipes, including stored
 * data that no longer decodes as a recipe.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.RecipeRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Recipe persistence operations. A recipe imported from a page is that page's
 * only recipe: it keeps the URL its first import submitted as its `source`,
 * and that URL's normalized form as a unique key, so later imports of the page
 * link it however they wrote the URL. A recipe saved directly has neither, and
 * a null source. Every operation that returns a recipe returns the same record
 * as `findById`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Saves a validated recipe entered directly, without a source or photo, and
   * returns it. Titles are not unique, so every call saves a new recipe. A
   * missing yield or total time is saved as null.
   */
  readonly create: (recipe: CreateRecipeRequest) => Effect.Effect<Recipe, PersistenceError>;
  /**
   * Saves a recipe imported from `url`, with its stored photo when it has one
   * and `url` as its source, unless a recipe of the same normalized URL is
   * already saved; then that recipe comes back unchanged, with its own content,
   * photo and source, and `created` is false, so the caller can remove its
   * unused photo. Inside a caller's transaction, such as an import that marks
   * its upload succeeded, it joins it as a savepoint. When a concurrent import
   * of the page saves first, this waits for it to commit and returns its
   * recipe, which needs READ COMMITTED, PostgreSQL's default. Fails when that
   * recipe is deleted before it can be read back.
   */
  readonly findOrCreateByUrl: (
    url: RecipeUrl,
    recipe: CreateRecipeRequest,
    image?: RecipeImage,
  ) => Effect.Effect<{ readonly recipe: Recipe; readonly created: boolean }, PersistenceError>;
  /** The ID of the recipe saved from this URL's normalized form; none when none is. */
  readonly findIdByUrl: (
    url: RecipeUrl,
  ) => Effect.Effect<Option.Option<RecipeId>, PersistenceError>;
  /** The saved recipe with this ID; none when no recipe has it. */
  readonly findById: (recipeId: RecipeId) => Effect.Effect<Option.Option<Recipe>, PersistenceError>;
  /**
   * Every recipe without its ingredients, steps or yield, by title A to Z
   * ignoring case, then newest first.
   */
  readonly list: Effect.Effect<ReadonlyArray<RecipeSummary>, PersistenceError>;
  /** The stored file and MIME type of the recipe's photo; none without one or a recipe. */
  readonly findImage: (
    recipeId: RecipeId,
  ) => Effect.Effect<Option.Option<RecipeImage>, PersistenceError>;
  /**
   * Locks the recipe, sets its photo, or removes it for `null`, and returns the
   * file of the photo it had, for the caller to remove once this commits; none
   * when the recipe does not exist. The lock serializes photo changes with each
   * other and with deletion, so the returned file is never the current one.
   * Removing a missing photo changes nothing, so `updatedAt` stays. Inside a
   * caller's transaction it joins it as a savepoint.
   */
  readonly setImage: (
    recipeId: RecipeId,
    image: RecipeImage | null,
  ) => Effect.Effect<Option.Option<{ readonly previousFileId: FileId | null }>, PersistenceError>;
  /**
   * Deletes the recipe and every upload that linked it, with their URLs, and
   * returns its photo's file ID for the caller to remove before committing;
   * none when the recipe does not exist. Uploads that did not link it stay. A
   * later import of the page saves a new recipe. The recipe is locked first, so
   * an upload linking it concurrently either commits first and is deleted with
   * it or fails to link a recipe that is gone.
   */
  readonly delete: (
    recipeId: RecipeId,
  ) => Effect.Effect<Option.Option<{ readonly imageFileId: FileId | null }>, PersistenceError>;
}

/**
 * Recipe persistence; callers decide how failures affect their workflow.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/RecipeRepository",
) {}

const IdRow = Schema.Struct({ id: RecipeId });

/**
 * Stores recipes on the shared SQL client.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // Text IDs keep their precision.
    const summaryColumns = `
      r.id::text AS id, r.title,
      CASE WHEN r.source_url IS NOT NULL THEN jsonb_build_object('kind', 'url', 'url', r.source_url)
      END AS source,
      r.total_time_seconds AS "totalTimeSeconds",
      r.image_file_id IS NOT NULL AS "hasImage",
      r.created_at::text AS "createdAt", r.updated_at::text AS "updatedAt"
    `;

    const selectRecipes = sql.literal(`
      SELECT ${summaryColumns}, r.ingredients, r.steps, r."yield" FROM recipes r
    `);

    const selectSummaries = sql.literal(`SELECT ${summaryColumns} FROM recipes r`);

    // A missing yield is SQL NULL, not JSON null. A direct recipe's null key
    // never conflicts, and only the URL key is tolerated.
    const insertRow = SqlSchema.findOneOption({
      Request: Schema.Struct({
        recipe: CreateRecipeRequest,
        image: Schema.NullOr(RecipeImage),
        source: Schema.NullOr(Schema.Struct({ url: Schema.String, normalizedUrl: Schema.String })),
      }),
      Result: IdRow,
      execute: ({ recipe, image, source }) => sql`
        INSERT INTO recipes (
          title, ingredients, steps, "yield", total_time_seconds,
          image_file_id, image_content_type, source_url, normalized_url
        ) VALUES (
          ${recipe.title},
          ${JSON.stringify(recipe.ingredients)}::jsonb,
          ${JSON.stringify(recipe.steps)}::jsonb,
          ${recipe.yield == null ? null : JSON.stringify(recipe.yield)}::jsonb,
          ${recipe.totalTimeSeconds ?? null},
          ${image?.fileId ?? null},
          ${image?.contentType ?? null},
          ${source?.url ?? null},
          ${source?.normalizedUrl ?? null}
        )
        ON CONFLICT ON CONSTRAINT recipes_normalized_url_key DO NOTHING
        RETURNING id::text AS id
      `,
    });

    const findRecipe = SqlSchema.findOneOption({
      Request: RecipeId,
      Result: Recipe,
      execute: (recipeId) => sql`${selectRecipes} WHERE r.id = ${recipeId}`,
    });

    const selectList = SqlSchema.findAll({
      Request: Schema.Void,
      Result: RecipeSummary,
      execute: () => sql`
        ${selectSummaries} ORDER BY lower(r.title), r.created_at DESC, r.id DESC
      `,
    });

    const selectIdByUrl = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: IdRow,
      execute: (normalizedUrl) => sql`
        SELECT id::text AS id FROM recipes WHERE normalized_url = ${normalizedUrl}
      `,
    });

    const selectImage = SqlSchema.findOneOption({
      Request: RecipeId,
      Result: RecipeImage,
      execute: (recipeId) => sql`
        SELECT image_file_id AS "fileId", image_content_type AS "contentType"
        FROM recipes WHERE id = ${recipeId} AND image_file_id IS NOT NULL
      `,
    });

    const lockRecipe = SqlSchema.findOneOption({
      Request: RecipeId,
      Result: IdRow,
      execute: (recipeId) => sql`
        SELECT id::text AS id FROM recipes WHERE id = ${recipeId} FOR UPDATE
      `,
    });

    const lockImage = SqlSchema.findOneOption({
      Request: RecipeId,
      Result: Schema.Struct({ previousFileId: Schema.NullOr(FileId) }),
      execute: (recipeId) => sql`
        SELECT image_file_id AS "previousFileId" FROM recipes WHERE id = ${recipeId} FOR UPDATE
      `,
    });

    const updateImage = SqlSchema.void({
      Request: Schema.Struct({ recipeId: RecipeId, image: Schema.NullOr(RecipeImage) }),
      execute: ({ recipeId, image }) => sql`
        UPDATE recipes
        SET image_file_id = ${image?.fileId ?? null}, image_content_type = ${image?.contentType ?? null}
        WHERE id = ${recipeId}
      `,
    });

    // Only uploads that linked the recipe have its ID; their URL rows cascade.
    const deleteUploads = SqlSchema.void({
      Request: RecipeId,
      execute: (recipeId) => sql`DELETE FROM recipe_uploads WHERE recipe_id = ${recipeId}`,
    });

    const deleteRow = SqlSchema.findOne({
      Request: RecipeId,
      Result: Schema.Struct({ imageFileId: Schema.NullOr(FileId) }),
      execute: (recipeId) => sql`
        DELETE FROM recipes WHERE id = ${recipeId} RETURNING image_file_id AS "imageFileId"
      `,
    });

    const readBack = (recipeId: RecipeId) =>
      findRecipe(recipeId).pipe(Effect.flatMap(Effect.fromOption));

    const create = Effect.fn("@goho/RecipeRepository.create")(
      (recipe: CreateRecipeRequest) =>
        sql.withTransaction(
          insertRow({ recipe, image: null, source: null }).pipe(
            Effect.flatMap(Effect.fromOption),
            Effect.flatMap(({ id }) => readBack(id)),
          ),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "create", cause })),
    );

    const findOrCreateByUrl = Effect.fn("@goho/RecipeRepository.findOrCreateByUrl")(
      (url: RecipeUrl, recipe: CreateRecipeRequest, image?: RecipeImage) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const normalizedUrl = normalizeRecipeUrl(url);
            const inserted = yield* insertRow({
              recipe,
              image: image ?? null,
              source: { url, normalizedUrl },
            });
            if (Option.isSome(inserted)) {
              return { recipe: yield* readBack(inserted.value.id), created: true };
            }
            // A new statement sees the recipe that committed while the insert waited.
            // It fails when that recipe was deleted since.
            const existing = yield* selectIdByUrl(normalizedUrl).pipe(
              Effect.flatMap(Effect.fromOption),
            );
            return { recipe: yield* readBack(existing.id), created: false };
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "findOrCreateByUrl", cause })),
    );

    const findIdByUrl = Effect.fn("@goho/RecipeRepository.findIdByUrl")(
      (url: RecipeUrl) =>
        selectIdByUrl(normalizeRecipeUrl(url)).pipe(Effect.map(Option.map(({ id }) => id))),
      Effect.mapError((cause) => new PersistenceError({ operation: "findIdByUrl", cause })),
    );

    const findById = Effect.fn("@goho/RecipeRepository.findById")(
      findRecipe,
      Effect.mapError((cause) => new PersistenceError({ operation: "findById", cause })),
    );

    const list = selectList(undefined).pipe(
      Effect.mapError((cause) => new PersistenceError({ operation: "list", cause })),
      Effect.withSpan("@goho/RecipeRepository.list"),
    );

    const findImage = Effect.fn("@goho/RecipeRepository.findImage")(
      selectImage,
      Effect.mapError((cause) => new PersistenceError({ operation: "findImage", cause })),
    );

    const setImage = Effect.fn("@goho/RecipeRepository.setImage")(
      (recipeId: RecipeId, image: RecipeImage | null) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const locked = yield* lockImage(recipeId);
            if (Option.isNone(locked)) return locked;
            if (image !== null || locked.value.previousFileId !== null) {
              yield* updateImage({ recipeId, image });
            }
            return locked;
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "setImage", cause })),
    );

    const deleteRecipe = Effect.fn("@goho/RecipeRepository.deleteRecipe")(
      (recipeId: RecipeId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Serializes with an upload linking this recipe, and keeps the file ID
            // until the caller's transaction commits.
            if (Option.isNone(yield* lockRecipe(recipeId))) return Option.none();
            yield* deleteUploads(recipeId);
            return Option.some(yield* deleteRow(recipeId));
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "delete", cause })),
    );

    return Service.of({
      create,
      delete: deleteRecipe,
      findById,
      findIdByUrl,
      findImage,
      findOrCreateByUrl,
      list,
      setImage,
    });
  }),
);
