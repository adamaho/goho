import { CreateRecipeRequest, Recipe, RecipeId, RecipeSummary } from "@goho/goho-api/recipes";
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
 * Recipe persistence operations. A recipe's `source` is the URL of the
 * succeeded upload that saved it, or null for a recipe saved directly. Every
 * operation that returns a recipe returns the same record as `findById`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Saves a validated recipe, with its stored photo when it has one, and returns
   * it. Titles are not unique, so every call saves a new recipe. A missing yield
   * or total time is saved as null. Inside a caller's transaction, such as an
   * import that marks its upload succeeded, the insert joins it as a savepoint;
   * the recipe has no source until that upload is linked.
   */
  readonly create: (
    recipe: CreateRecipeRequest,
    image?: RecipeImage,
  ) => Effect.Effect<Recipe, PersistenceError>;
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
   * Deletes the recipe and the upload that saved it, freeing that URL for a new
   * import, and returns its photo's file ID for the caller to remove before
   * committing; none when the recipe does not exist. The recipe is locked first,
   * so an upload linking it concurrently either commits first and is deleted
   * with it or fails to link a recipe that is gone.
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

    // Text IDs keep their precision. Only a succeeded upload has a recipe ID, so
    // its URL is the source. A linked upload without its URL row builds a null
    // URL, which fails decoding instead of hiding the source.
    const summaryColumns = `
      r.id::text AS id, r.title,
      CASE WHEN up.id IS NOT NULL THEN jsonb_build_object('kind', 'url', 'url', src.url) END
        AS source,
      r.total_time_seconds AS "totalTimeSeconds",
      r.image_file_id IS NOT NULL AS "hasImage",
      r.created_at::text AS "createdAt", r.updated_at::text AS "updatedAt"
    `;

    const fromRecipes = `
      FROM recipes r
      LEFT JOIN recipe_uploads up ON up.recipe_id = r.id
      LEFT JOIN recipe_upload_urls src ON src.upload_id = up.id
    `;

    const selectRecipes = sql.literal(`
      SELECT ${summaryColumns}, r.ingredients, r.steps, r."yield" ${fromRecipes}
    `);

    const selectSummaries = sql.literal(`SELECT ${summaryColumns} ${fromRecipes}`);

    const insertRow = SqlSchema.findOne({
      Request: Schema.Struct({ recipe: CreateRecipeRequest, image: Schema.NullOr(RecipeImage) }),
      Result: IdRow,
      // A missing yield is SQL NULL, not JSON null.
      execute: ({ recipe, image }) => sql`
        INSERT INTO recipes (
          title, ingredients, steps, "yield", total_time_seconds,
          image_file_id, image_content_type
        ) VALUES (
          ${recipe.title},
          ${JSON.stringify(recipe.ingredients)}::jsonb,
          ${JSON.stringify(recipe.steps)}::jsonb,
          ${recipe.yield == null ? null : JSON.stringify(recipe.yield)}::jsonb,
          ${recipe.totalTimeSeconds ?? null},
          ${image?.fileId ?? null},
          ${image?.contentType ?? null}
        )
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

    // Its URL row cascades with it.
    const deleteUpload = SqlSchema.void({
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

    const create = Effect.fn("@goho/RecipeRepository.create")(
      (recipe: CreateRecipeRequest, image?: RecipeImage) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const { id } = yield* insertRow({ recipe, image: image ?? null });
            return yield* findRecipe(id).pipe(Effect.flatMap(Effect.fromOption));
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "create", cause })),
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

    const deleteRecipe = Effect.fn("@goho/RecipeRepository.deleteRecipe")(
      (recipeId: RecipeId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Serializes with an upload linking this recipe, and keeps the file ID
            // until the caller's transaction commits.
            if (Option.isNone(yield* lockRecipe(recipeId))) return Option.none();
            yield* deleteUpload(recipeId);
            return Option.some(yield* deleteRow(recipeId));
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "delete", cause })),
    );

    return Service.of({ create, delete: deleteRecipe, findById, findImage, list });
  }),
);
