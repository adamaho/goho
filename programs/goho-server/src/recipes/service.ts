import {
  type CreateRecipeRequest,
  type Recipe,
  type RecipeId,
  RecipeImageNotFound,
  RecipeNotFound,
  RecipesUnavailable,
  type RecipeSummary,
} from "@goho/goho-api/recipes";
import { Context, Effect, Layer, Option } from "effect";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/services/file-storage.ts";

import type { RecipeImageContentType } from "./model.ts";
import * as RecipeRepository from "./repository.ts";

// Persistence and storage details stay in the logs; callers see the domain error.
const unavailable = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new RecipesUnavailable())));

/**
 * Recipe operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /** Saves a complete recipe directly, without an upload or AI; it has no source or photo. */
  readonly create: (recipe: CreateRecipeRequest) => Effect.Effect<Recipe, RecipesUnavailable>;
  /** Recipe summaries by title A to Z ignoring case, then newest first. */
  readonly list: Effect.Effect<ReadonlyArray<RecipeSummary>, RecipesUnavailable>;
  readonly get: (recipeId: RecipeId) => Effect.Effect<Recipe, RecipeNotFound | RecipesUnavailable>;
  /**
   * Deletes the recipe, every upload that linked it, and its stored photo; a
   * later import of the page saves a new recipe. The photo is removed before
   * the database commits, so a storage failure keeps the rows for a retry.
   */
  readonly delete: (recipeId: RecipeId) => Effect.Effect<void, RecipeNotFound | RecipesUnavailable>;
  readonly getImage: (
    recipeId: RecipeId,
  ) => Effect.Effect<
    { readonly bytes: Uint8Array; readonly contentType: RecipeImageContentType },
    RecipeImageNotFound | RecipesUnavailable
  >;
}

/**
 * Saves, lists, retrieves and deletes recipes, and serves their photos.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/goho-server/Recipes") {}

/**
 * Provides recipe operations over the recipe repository and file storage.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* RecipeRepository.Service;
    const storage = yield* FileStorage.Service;
    const transaction = yield* Transaction.Service;

    const create = Effect.fn("@goho/Recipes.create")(
      (recipe: CreateRecipeRequest) => repository.create(recipe),
      Effect.catchTag(
        "GohoServer.RecipeRepository.PersistenceError",
        unavailable("Recipe creation failed"),
      ),
    );

    const list = repository.list.pipe(
      Effect.catchTag(
        "GohoServer.RecipeRepository.PersistenceError",
        unavailable("Recipe listing failed"),
      ),
      Effect.withSpan("@goho/Recipes.list"),
    );

    const get = Effect.fn("@goho/Recipes.get")(
      (recipeId: RecipeId) =>
        repository
          .findById(recipeId)
          .pipe(
            Effect.flatMap((found) =>
              Effect.fromOption(found).pipe(Effect.mapError(() => new RecipeNotFound())),
            ),
          ),
      Effect.catchTag(
        "GohoServer.RecipeRepository.PersistenceError",
        unavailable("Recipe retrieval failed"),
      ),
    );

    const deletionFailed = unavailable("Recipe deletion failed");

    const deleteRecipe = Effect.fn("@goho/Recipes.deleteRecipe")(
      (recipeId: RecipeId) =>
        transaction.run(
          Effect.gen(function* () {
            const deleted = yield* repository.delete(recipeId);
            if (Option.isNone(deleted)) return yield* new RecipeNotFound();
            const { imageFileId } = deleted.value;
            if (imageFileId !== null) yield* storage.delete(imageFileId);
          }),
        ),
      Effect.catchTags({
        "GohoServer.RecipeRepository.PersistenceError": deletionFailed,
        "GohoServer.FileStorage.StorageError": deletionFailed,
        "GohoServer.Database.TransactionError": deletionFailed,
      }),
    );

    const getImage = Effect.fn("@goho/Recipes.getImage")(
      function* (recipeId: RecipeId) {
        const image = yield* repository.findImage(recipeId);
        if (Option.isNone(image)) return yield* new RecipeImageNotFound();
        const bytes = yield* storage.get(image.value.fileId);
        return { bytes, contentType: image.value.contentType };
      },
      Effect.catchTags({
        "GohoServer.RecipeRepository.PersistenceError": unavailable("Recipe photo lookup failed"),
        "GohoServer.FileStorage.StorageError": unavailable("Recipe photo retrieval failed"),
      }),
    );

    return Service.of({ create, delete: deleteRecipe, get, getImage, list });
  }),
);
