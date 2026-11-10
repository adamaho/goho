import {
  type RecipeUpload,
  RecipeUploadConflict,
  RecipeUploadId,
  RecipeUploadNotFound,
  RecipeUploadsUnavailable,
} from "@goho/goho-api/recipe-uploads";
import type { RecipeSource } from "@goho/goho-api/recipes";
import { Context, Effect, Layer } from "effect";
import { SecureRandom } from "effect/crypto";

import * as Transaction from "#src/database/transaction.ts";

import * as RecipeUploadQueue from "./queue.ts";
import * as RecipeUploadRepository from "./repository.ts";

// Persistence details stay in the logs; callers see the domain error.
const unavailable = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new RecipeUploadsUnavailable())));

/**
 * Recipe import operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Queues a new import of the source's page, and its job, in one transaction.
   * Every submission gets its own import, even of a page imported before; its
   * job links an already saved recipe of the same normalized URL instead of
   * importing the page again.
   */
  readonly create: (source: RecipeSource) => Effect.Effect<RecipeUpload, RecipeUploadsUnavailable>;
  /** Every import, newest first. */
  readonly list: Effect.Effect<ReadonlyArray<RecipeUpload>, RecipeUploadsUnavailable>;
  readonly get: (
    uploadId: RecipeUploadId,
  ) => Effect.Effect<RecipeUpload, RecipeUploadNotFound | RecipeUploadsUnavailable>;
  /** Deletes a failed import and its URL; other states fail with a conflict. */
  readonly delete: (
    uploadId: RecipeUploadId,
  ) => Effect.Effect<void, RecipeUploadNotFound | RecipeUploadConflict | RecipeUploadsUnavailable>;
}

/**
 * Queues recipe imports, retrieves their durable status, and deletes failed ones.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/RecipeUploads",
) {}

/**
 * Saves each import and its queue job in one transaction.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* RecipeUploadRepository.Service;
    const queue = yield* RecipeUploadQueue.Service;
    const transaction = yield* Transaction.Service;
    const random = yield* SecureRandom.SecureRandom;

    const create = Effect.fn("@goho/RecipeUploads.create")(
      function* (source: RecipeSource) {
        const uploadId = RecipeUploadId.make(yield* random.uuidV4());
        return yield* transaction.run(
          Effect.gen(function* () {
            const upload = yield* repository.createQueued(uploadId, source);
            yield* queue.offer({ uploadId: upload.id });
            return upload;
          }),
        );
      },
      Effect.catch(unavailable("Recipe import could not be saved and queued")),
    );

    const get = Effect.fn("@goho/RecipeUploads.get")(
      (uploadId: RecipeUploadId) =>
        repository
          .findById(uploadId)
          .pipe(
            Effect.flatMap((found) =>
              Effect.fromOption(found).pipe(Effect.mapError(() => new RecipeUploadNotFound())),
            ),
          ),
      Effect.catchTag(
        "GohoServer.RecipeUploadRepository.PersistenceError",
        unavailable("Recipe import retrieval failed"),
      ),
    );

    const list = repository.list.pipe(
      Effect.catchTag(
        "GohoServer.RecipeUploadRepository.PersistenceError",
        unavailable("Recipe import listing failed"),
      ),
      Effect.withSpan("@goho/RecipeUploads.list"),
    );

    const deleteUpload = Effect.fn("@goho/RecipeUploads.deleteUpload")(
      (uploadId: RecipeUploadId) => repository.deleteFailed(uploadId),
      Effect.catchTags({
        "GohoServer.RecipeUploadRepository.UploadNotFound": () =>
          Effect.fail(new RecipeUploadNotFound()),
        "GohoServer.RecipeUploadRepository.DeletionNotAllowed": () =>
          Effect.fail(new RecipeUploadConflict()),
        "GohoServer.RecipeUploadRepository.PersistenceError": unavailable(
          "Recipe import deletion failed",
        ),
      }),
    );

    return Service.of({ create, delete: deleteUpload, get, list });
  }),
);
