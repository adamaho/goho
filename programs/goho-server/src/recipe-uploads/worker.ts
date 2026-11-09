import type { Ai } from "@goho/core";
import { RecipeUploadFailureCode, type RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { Effect, Layer, Option, Schedule, Schema } from "effect";

import * as Transaction from "#src/database/transaction.ts";
import * as QueueConstants from "#src/queues/constants.ts";
import * as RecipesImport from "#src/recipes/import.ts";
import type { ImportedRecipe, Photo, RecipeImage } from "#src/recipes/model.ts";
import * as RecipeRepository from "#src/recipes/repository.ts";
import * as FileStorage from "#src/services/file-storage.ts";
import type * as WebFetch from "#src/services/web-fetch.ts";

import { type RecipeUploadJob, Service as RecipeUploadQueue } from "./queue.ts";
import * as RecipeUploadRepository from "./repository.ts";

// `retryable` is false only for rejections of the page itself, which no later
// attempt can change.
class ProcessingError extends Schema.TaggedError<ProcessingError>()(
  "GohoServer.RecipeUploads.ProcessingError",
  { failureCode: RecipeUploadFailureCode, retryable: Schema.Boolean, cause: Schema.Defect() },
) {}

const failAs = (failureCode: RecipeUploadFailureCode) =>
  Effect.mapError((cause: unknown) => new ProcessingError({ failureCode, retryable: true, cause }));

/**
 * Stores the photo, then saves the recipe and marks the upload succeeded in one
 * transaction. A photo that cannot be stored is logged and dropped, and a stored
 * photo is removed again when the save fails. Uninterruptible, so a shutdown
 * cannot strand a stored photo between these steps; it holds no network or AI
 * work, only the file write and the transaction.
 */
const save = Effect.fnUntraced(function* (uploadId: RecipeUploadId, imported: ImportedRecipe) {
  const uploads = yield* RecipeUploadRepository.Service;
  const recipes = yield* RecipeRepository.Service;
  const storage = yield* FileStorage.Service;
  const transaction = yield* Transaction.Service;

  const storePhoto = ({ bytes, contentType }: Photo) =>
    storage.put({ name: "recipe-photo", contentType, bytes }).pipe(
      Effect.map((fileId) => Option.some<RecipeImage>({ fileId, contentType })),
      Effect.catchTag("GohoServer.FileStorage.StorageError", (error) =>
        Effect.logWarning("Recipe photo could not be stored; saving without it", error).pipe(
          Effect.as(Option.none<RecipeImage>()),
        ),
      ),
    );
  const image = Option.isSome(imported.photo)
    ? yield* storePhoto(imported.photo.value)
    : Option.none<RecipeImage>();

  yield* transaction
    .run(
      Effect.gen(function* () {
        const recipe = yield* recipes
          .create(imported.recipe, Option.getOrUndefined(image))
          .pipe(failAs("recipe_creation_failed"));
        // Refused unless the upload is still processing, which rolls the recipe back.
        yield* uploads.markSucceeded(uploadId, recipe.id).pipe(failAs("internal_error"));
      }),
    )
    .pipe(
      Effect.catchTag("GohoServer.Database.TransactionError", failAs("internal_error")),
      Effect.onError(() =>
        Option.match(image, {
          onNone: () => Effect.void,
          onSome: ({ fileId }) =>
            storage
              .delete(fileId)
              .pipe(
                Effect.catchTag("GohoServer.FileStorage.StorageError", (error) =>
                  Effect.logError("Orphaned recipe photo could not be deleted", error).pipe(
                    Effect.annotateLogs({ fileId }),
                  ),
                ),
              ),
        }),
      ),
    );
}, Effect.uninterruptible);

/**
 * Processes one persisted queue delivery. A temporary failure fails the
 * delivery so the queue retries it, and is recorded on the upload after the
 * final attempt. A rejection of the page is recorded at once and completes the
 * delivery. The recipe is saved in the transaction that marks the upload
 * succeeded, so a redelivered job finds a finished upload and changes nothing.
 *
 * @category workflows
 * @since 0.1.0
 */
export const process: (
  job: RecipeUploadJob,
  metadata: { readonly id: string; readonly attempts: number },
) => Effect.Effect<
  void,
  ProcessingError,
  | Ai.Service
  | FileStorage.Service
  | RecipeRepository.Service
  | RecipeUploadRepository.Service
  | Transaction.Service
  | WebFetch.Service
> = Effect.fn("@goho/RecipeUploads.process")(function* (
  job: RecipeUploadJob,
  metadata: { readonly id: string; readonly attempts: number },
) {
  const uploads = yield* RecipeUploadRepository.Service;
  return yield* Effect.gen(function* () {
    // A finished upload means another delivery already recorded its outcome.
    const upload = yield* uploads.markProcessing(job.uploadId).pipe(
      Effect.catchTags({
        "GohoServer.RecipeUploadRepository.UploadNotFound": () =>
          Effect.logWarning("Discarding a recipe upload job without an upload row", {
            uploadId: job.uploadId,
          }).pipe(Effect.as(null)),
        "GohoServer.RecipeUploadRepository.InvalidTransition": (error) =>
          Effect.logInfo("Discarding a recipe upload job for a finished upload", {
            uploadId: job.uploadId,
            status: error.currentStatus,
          }).pipe(Effect.as(null)),
      }),
      failAs("internal_error"),
    );
    if (upload === null) return;

    // The page fetch and AI run before, and outside, any transaction.
    const imported = yield* RecipesImport.fromUrl(upload.source.url).pipe(
      Effect.mapError(
        (error) =>
          new ProcessingError({
            failureCode: error.failureCode,
            retryable: error.retryable,
            cause: error,
          }),
      ),
    );
    yield* save(upload.id, imported);
  }).pipe(
    Effect.catchTag("GohoServer.RecipeUploads.ProcessingError", (error) =>
      Effect.gen(function* () {
        if (error.retryable && metadata.attempts < QueueConstants.maxAttempts) {
          return yield* error;
        }
        const recorded = yield* uploads.markFailed(job.uploadId, error.failureCode).pipe(
          Effect.retry(Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 2 }))),
          Effect.as(true),
          Effect.catchCause((cause) =>
            Effect.logError("Recipe upload terminal failure could not be recorded", cause).pipe(
              Effect.as(false),
            ),
          ),
        );
        // An exhausted job fails in its queue; an unrecorded rejection is retried,
        // and the recovery pass fails it once the queue gives up.
        if (error.retryable || !recorded) return yield* error;
        yield* Effect.logWarning("Recipe import rejected", error);
      }),
    ),
  );
});

/**
 * Runs the recipe upload consumer for the lifetime of the application scope.
 * It takes one job at a time, so each process imports at most one page at once.
 */
const run = Effect.gen(function* () {
  const queue = yield* RecipeUploadQueue;
  yield* queue.take(process);
}).pipe(
  Effect.catch((error) =>
    Effect.logError("Recipe upload worker attempt failed", error).pipe(Effect.delay("1 second")),
  ),
  Effect.forever,
);

/**
 * Fails imports whose queue job failed without the worker recording it, such as
 * after a crash during the final attempt. Runs at startup, then every 30 seconds.
 */
const recover = RecipeUploadRepository.Service.pipe(
  Effect.flatMap((uploads) => uploads.markAbandonedFailed),
  Effect.tap((failed) =>
    failed.length === 0
      ? Effect.void
      : Effect.logWarning("Failed recipe uploads abandoned by the queue", {
          uploadIds: failed.map((upload) => upload.id),
        }),
  ),
  Effect.catchTag("GohoServer.RecipeUploadRepository.PersistenceError", (error) =>
    Effect.logError("Recipe upload recovery pass failed", error),
  ),
  Effect.repeat(Schedule.spaced("30 seconds")),
);

/**
 * Runs the recipe upload consumer and recovery pass for the lifetime of the
 * application scope. Forking lets layer acquisition finish; closing the scope
 * interrupts both.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    // The queue requirement builds its layer, and so creates the table recovery
    // reads, before either fiber starts.
    yield* Effect.forkScoped(recover);
    yield* Effect.forkScoped(run);
  }),
);
