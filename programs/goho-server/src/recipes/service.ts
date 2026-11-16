import {
  type CreateRecipeRequest,
  type Recipe,
  type RecipeId,
  RecipeImageNotFound,
  RecipeNotFound,
  RecipesUnavailable,
  type RecipeSummary,
} from "@goho/goho-api/recipes";
import { Context, Effect, Exit, Layer, Option } from "effect";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/services/file-storage.ts";

import type { Photo, RecipeImageContentType } from "./model.ts";
import * as RecipePdf from "./pdf.ts";
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
   * Draws the saved recipe as a printable PDF, with its photo when it has one,
   * and returns the recipe's title with it. A photo file that can't be read is
   * logged and left out rather than failing the PDF. Renders wait their turn,
   * one at a time per process.
   */
  readonly getPdf: (
    recipeId: RecipeId,
  ) => Effect.Effect<
    { readonly title: string; readonly bytes: Uint8Array },
    RecipeNotFound | RecipesUnavailable
  >;
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
  /**
   * Stores the photo and makes it the recipe's only one, then removes the file
   * it replaced. `created` when the recipe had no photo, else `replaced`.
   * Concurrent changes apply in lock order, so the last to commit wins. Any
   * failure keeps the previous photo and removes the new file.
   */
  readonly putImage: (
    recipeId: RecipeId,
    photo: Photo,
  ) => Effect.Effect<"created" | "replaced", RecipeNotFound | RecipesUnavailable>;
  /** Removes the recipe's photo and its file; succeeds when it had none. */
  readonly deleteImage: (
    recipeId: RecipeId,
  ) => Effect.Effect<void, RecipeNotFound | RecipesUnavailable>;
}

/**
 * Saves, lists, retrieves, draws as PDFs and deletes recipes, and serves, sets
 * and removes their photos.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/goho-server/Recipes") {}

/**
 * Provides recipe operations over the recipe repository, file storage and PDF
 * rendering.
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
    const pdf = yield* RecipePdf.Service;

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

    // The photo's file can go missing, such as when a photo change commits in
    // between; the recipe is still worth printing without it.
    const photoFor = (recipeId: RecipeId) =>
      repository.findImage(recipeId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeedNone,
            onSome: ({ fileId, contentType }) =>
              storage.get(fileId).pipe(
                Effect.map((bytes): Option.Option<Photo> => Option.some({ bytes, contentType })),
                Effect.catchTag("GohoServer.FileStorage.StorageError", (error) =>
                  Effect.logError("Recipe PDF drawn without its unreadable photo", error).pipe(
                    Effect.annotateLogs({ recipeId, fileId }),
                    Effect.as(Option.none()),
                  ),
                ),
              ),
          }),
        ),
      );

    const getPdf = Effect.fn("@goho/Recipes.getPdf")(
      function* (recipeId: RecipeId) {
        const recipe = yield* repository.findById(recipeId);
        if (Option.isNone(recipe)) return yield* new RecipeNotFound();
        const photo = yield* photoFor(recipeId);
        const bytes = yield* pdf.render(recipe.value, photo);
        return { title: recipe.value.title, bytes };
      },
      Effect.catchTags({
        "GohoServer.RecipeRepository.PersistenceError": unavailable("Recipe PDF lookup failed"),
        "GohoServer.Recipes.PdfError": unavailable("Recipe PDF rendering failed"),
      }),
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

    // A file no row references any more; failing to remove it only leaves it orphaned.
    const removeUnused = (fileId: FileStorage.FileId) =>
      storage
        .delete(fileId)
        .pipe(
          Effect.catchTag("GohoServer.FileStorage.StorageError", (error) =>
            Effect.logError("Orphaned recipe photo could not be deleted", error).pipe(
              Effect.annotateLogs({ fileId }),
            ),
          ),
        );

    const photoChangeFailed = unavailable("Recipe photo change failed");

    // Uninterruptible like the import's save: it holds only the file writes and
    // one short transaction, and a client hanging up must not strand a file.
    const putImage = Effect.fn("@goho/Recipes.putImage")(
      function* (recipeId: RecipeId, { bytes, contentType }: Photo) {
        const fileId = yield* storage.put({ name: "recipe-photo", contentType, bytes });
        const changed = yield* repository
          .setImage(recipeId, { fileId, contentType })
          .pipe(
            Effect.onExit((exit) =>
              Exit.isSuccess(exit) && Option.isSome(exit.value)
                ? Effect.void
                : removeUnused(fileId),
            ),
          );
        if (Option.isNone(changed)) return yield* new RecipeNotFound();
        const { previousFileId } = changed.value;
        if (previousFileId === null) return "created" as const;
        yield* removeUnused(previousFileId);
        return "replaced" as const;
      },
      Effect.catchTags({
        "GohoServer.RecipeRepository.PersistenceError": photoChangeFailed,
        "GohoServer.FileStorage.StorageError": photoChangeFailed,
      }),
      Effect.uninterruptible,
    );

    const deleteImage = Effect.fn("@goho/Recipes.deleteImage")(
      function* (recipeId: RecipeId) {
        const changed = yield* repository.setImage(recipeId, null);
        if (Option.isNone(changed)) return yield* new RecipeNotFound();
        const { previousFileId } = changed.value;
        if (previousFileId !== null) yield* removeUnused(previousFileId);
      },
      Effect.catchTag("GohoServer.RecipeRepository.PersistenceError", photoChangeFailed),
      Effect.uninterruptible,
    );

    return Service.of({
      create,
      delete: deleteRecipe,
      deleteImage,
      get,
      getImage,
      getPdf,
      list,
      putImage,
    });
  }),
);
