import {
  RecipeUpload,
  RecipeUploadFailureCode,
  RecipeUploadId,
  RecipeUploadStatus,
} from "@goho/goho-api/recipe-uploads";
import { RecipeId, type RecipeSource } from "@goho/goho-api/recipes";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import * as QueueConstants from "#src/queues/constants.ts";

import * as RecipeUploadQueue from "./queue.ts";

/**
 * Unexpected failure while reading or saving recipe imports, including stored
 * data that no longer decodes as an import.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.RecipeUploadRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * The requested recipe import does not exist.
 *
 * @category errors
 * @since 0.1.0
 */
export class UploadNotFound extends Schema.TaggedError<UploadNotFound>()(
  "GohoServer.RecipeUploadRepository.UploadNotFound",
  { uploadId: RecipeUploadId },
) {}

/**
 * The recipe import cannot move from its current state to the requested state.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidTransition extends Schema.TaggedError<InvalidTransition>()(
  "GohoServer.RecipeUploadRepository.InvalidTransition",
  {
    uploadId: RecipeUploadId,
    currentStatus: RecipeUploadStatus,
    requestedStatus: RecipeUploadStatus,
  },
) {}

/**
 * Only failed recipe imports may be deleted directly.
 *
 * @category errors
 * @since 0.1.0
 */
export class DeletionNotAllowed extends Schema.TaggedError<DeletionNotAllowed>()(
  "GohoServer.RecipeUploadRepository.DeletionNotAllowed",
  { uploadId: RecipeUploadId, currentStatus: RecipeUploadStatus },
) {}

type TransitionError = PersistenceError | UploadNotFound | InvalidTransition;

/**
 * Recipe import persistence operations. Every operation that returns an import
 * returns the same record as `findById`, with its source URL as submitted.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Saves a queued import with `uploadId` and the URL as submitted. Every call
   * saves a new import, whether or not the page was imported before; the worker
   * reuses a saved recipe. The upload and its URL are saved together; inside a caller's transaction they join it as a
   * savepoint, so the caller can enqueue its job atomically.
   */
  readonly createQueued: (
    uploadId: RecipeUploadId,
    source: RecipeSource,
  ) => Effect.Effect<RecipeUpload, PersistenceError>;
  readonly findById: (
    uploadId: RecipeUploadId,
  ) => Effect.Effect<Option.Option<RecipeUpload>, PersistenceError>;
  /** Every import, newest first. */
  readonly list: Effect.Effect<ReadonlyArray<RecipeUpload>, PersistenceError>;
  /** Moves a queued import to processing; an import already processing stays so for a retried job. */
  readonly markProcessing: (
    uploadId: RecipeUploadId,
  ) => Effect.Effect<RecipeUpload, TransitionError>;
  /**
   * Links a processing import to the recipe it saved or found; several imports
   * can link one recipe. Locks the recipe first, which serializes this with
   * recipe deletion; fails, changing nothing, when the recipe no longer exists.
   * Joins the caller's transaction as a savepoint, so saving the recipe and
   * this status change can commit together.
   */
  readonly markSucceeded: (
    uploadId: RecipeUploadId,
    recipeId: RecipeId,
  ) => Effect.Effect<RecipeUpload, TransitionError>;
  /** Fails a queued or processing import; finished imports keep their outcome. */
  readonly markFailed: (
    uploadId: RecipeUploadId,
    failureCode: RecipeUploadFailureCode,
  ) => Effect.Effect<RecipeUpload, TransitionError>;
  /** Deletes a failed import with its URL. An import has no stored file. */
  readonly deleteFailed: (
    uploadId: RecipeUploadId,
  ) => Effect.Effect<void, PersistenceError | UploadNotFound | DeletionNotAllowed>;
  /**
   * Marks queued or processing imports failed with `internal_error` when their
   * queue job has already failed, and returns the imports it changed. Requires
   * the queue table, which the queue layer creates.
   */
  readonly markAbandonedFailed: Effect.Effect<ReadonlyArray<RecipeUpload>, PersistenceError>;
}

/**
 * Durable state for recipe imports and the recipes they saved.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/RecipeUploadRepository",
) {}

const IdRow = Schema.Struct({ id: RecipeUploadId });

/**
 * Stores and transitions recipe import state with guarded SQL updates.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // Selects from an upload relation `u`. Text recipe IDs keep their precision. An
    // upload without its URL row builds a null URL, which fails decoding instead of
    // hiding the upload.
    const columns = sql.literal(`
      u.id, jsonb_build_object('kind', 'url', 'url', src.url) AS source, u.status,
      u.recipe_id::text AS "recipeId", u.failure_code AS "failureCode",
      u.created_at::text AS "createdAt", u.updated_at::text AS "updatedAt"
    `);

    const withSource = sql.literal(`LEFT JOIN recipe_upload_urls src ON src.upload_id = u.id`);

    const persistenceError = (operation: string) =>
      Effect.mapError((cause: unknown) => new PersistenceError({ operation, cause }));

    const selectById = SqlSchema.findOneOption({
      Request: RecipeUploadId,
      Result: RecipeUpload,
      execute: (uploadId) => sql`
        SELECT ${columns} FROM recipe_uploads u ${withSource} WHERE u.id = ${uploadId}
      `,
    });

    const selectAll = SqlSchema.findAll({
      Request: Schema.Void,
      Result: RecipeUpload,
      execute: () => sql`
        SELECT ${columns} FROM recipe_uploads u ${withSource}
        ORDER BY u.created_at DESC, u.id DESC
      `,
    });

    const insertUpload = SqlSchema.void({
      Request: RecipeUploadId,
      execute: (uploadId) => sql`
        INSERT INTO recipe_uploads (id, status) VALUES (${uploadId}, 'queued')
      `,
    });

    const insertUrl = SqlSchema.void({
      Request: Schema.Struct({ uploadId: RecipeUploadId, url: Schema.String }),
      execute: (row) => sql`
        INSERT INTO recipe_upload_urls (upload_id, url) VALUES (${row.uploadId}, ${row.url})
      `,
    });

    const deleteFailedRow = SqlSchema.findOneOption({
      Request: RecipeUploadId,
      Result: IdRow,
      execute: (uploadId) => sql`
        DELETE FROM recipe_uploads WHERE id = ${uploadId} AND status = 'failed' RETURNING id
      `,
    });

    const updateToProcessing = SqlSchema.findOneOption({
      Request: RecipeUploadId,
      Result: RecipeUpload,
      execute: (uploadId) => sql`
        WITH u AS (
          UPDATE recipe_uploads SET status = 'processing'
          WHERE id = ${uploadId} AND status IN ('queued', 'processing')
          RETURNING *
        )
        SELECT ${columns} FROM u ${withSource}
      `,
    });

    const lockRecipe = SqlSchema.findOneOption({
      Request: RecipeId,
      Result: Schema.Struct({ id: RecipeId }),
      execute: (recipeId) => sql`
        SELECT id::text AS id FROM recipes WHERE id = ${recipeId} FOR UPDATE
      `,
    });

    const updateToSucceeded = SqlSchema.findOneOption({
      Request: Schema.Struct({ uploadId: RecipeUploadId, recipeId: RecipeId }),
      Result: RecipeUpload,
      execute: ({ uploadId, recipeId }) => sql`
        WITH u AS (
          UPDATE recipe_uploads SET status = 'succeeded', recipe_id = ${recipeId}
          WHERE id = ${uploadId} AND status = 'processing'
          RETURNING *
        )
        SELECT ${columns} FROM u ${withSource}
      `,
    });

    const updateToFailed = SqlSchema.findOneOption({
      Request: Schema.Struct({ uploadId: RecipeUploadId, failureCode: RecipeUploadFailureCode }),
      Result: RecipeUpload,
      execute: ({ uploadId, failureCode }) => sql`
        WITH u AS (
          UPDATE recipe_uploads SET status = 'failed', failure_code = ${failureCode}
          WHERE id = ${uploadId} AND status IN ('queued', 'processing')
          RETURNING *
        )
        SELECT ${columns} FROM u ${withSource}
      `,
    });

    const updateAbandonedToFailed = SqlSchema.findAll({
      Request: Schema.Void,
      Result: RecipeUpload,
      execute: () => sql`
        WITH u AS (
          UPDATE recipe_uploads SET status = 'failed', failure_code = 'internal_error'
          WHERE status IN ('queued', 'processing')
          AND id::text IN (
            SELECT id FROM ${sql(QueueConstants.tableName)}
            WHERE queue_name = ${RecipeUploadQueue.name} AND state = 'failed'
          )
          RETURNING *
        )
        SELECT ${columns} FROM u ${withSource}
      `,
    });

    const createQueued = Effect.fn("@goho/RecipeUploadRepository.createQueued")(
      (uploadId: RecipeUploadId, source: RecipeSource) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* insertUpload(uploadId);
            yield* insertUrl({ uploadId, url: source.url });
            return yield* selectById(uploadId).pipe(Effect.flatMap(Effect.fromOption));
          }),
        ),
      persistenceError("createQueued"),
    );

    const findById = Effect.fn("@goho/RecipeUploadRepository.findById")(
      selectById,
      persistenceError("findById"),
    );

    const list = selectAll(undefined).pipe(
      persistenceError("list"),
      Effect.withSpan("@goho/RecipeUploadRepository.list"),
    );

    // A guarded update that matched no row either lost the upload or found it in
    // a state that does not allow the requested transition.
    const transition = Effect.fnUntraced(function* <E>(
      operation: string,
      uploadId: RecipeUploadId,
      requestedStatus: RecipeUploadStatus,
      update: Effect.Effect<Option.Option<RecipeUpload>, E>,
    ) {
      const updated = yield* update.pipe(persistenceError(operation));
      if (Option.isSome(updated)) return updated.value;
      const current = yield* findById(uploadId);
      if (Option.isNone(current)) return yield* new UploadNotFound({ uploadId });
      return yield* new InvalidTransition({
        uploadId,
        currentStatus: current.value.status,
        requestedStatus,
      });
    });

    const markProcessing = Effect.fn("@goho/RecipeUploadRepository.markProcessing")(
      (uploadId: RecipeUploadId) =>
        transition("markProcessing", uploadId, "processing", updateToProcessing(uploadId)),
    );

    const markSucceeded = Effect.fn("@goho/RecipeUploadRepository.markSucceeded")(
      (uploadId: RecipeUploadId, recipeId: RecipeId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const locked = yield* lockRecipe(recipeId).pipe(persistenceError("markSucceeded"));
            if (Option.isNone(locked)) {
              return yield* new PersistenceError({
                operation: "markSucceeded",
                cause: `Recipe ${recipeId} was deleted before the upload succeeded`,
              });
            }
            return yield* transition(
              "markSucceeded",
              uploadId,
              "succeeded",
              updateToSucceeded({ uploadId, recipeId }),
            );
          }),
        ),
      Effect.catchTag("SqlError", (cause) =>
        Effect.fail(new PersistenceError({ operation: "markSucceeded", cause })),
      ),
    );

    const markFailed = Effect.fn("@goho/RecipeUploadRepository.markFailed")(
      (uploadId: RecipeUploadId, failureCode: RecipeUploadFailureCode) =>
        transition("markFailed", uploadId, "failed", updateToFailed({ uploadId, failureCode })),
    );

    const deleteFailed = Effect.fn("@goho/RecipeUploadRepository.deleteFailed")(function* (
      uploadId: RecipeUploadId,
    ) {
      // Guard deletion in SQL so active or successful work cannot lose its upload.
      const deleted = yield* deleteFailedRow(uploadId).pipe(persistenceError("deleteFailed"));
      if (Option.isSome(deleted)) return;
      const current = yield* findById(uploadId);
      if (Option.isNone(current)) return yield* new UploadNotFound({ uploadId });
      return yield* new DeletionNotAllowed({ uploadId, currentStatus: current.value.status });
    });

    // The queue does not redeliver failed jobs, so their unfinished imports need
    // reconciling. The status guard leaves imports a running worker already finished.
    const markAbandonedFailed = updateAbandonedToFailed(undefined).pipe(
      persistenceError("markAbandonedFailed"),
      Effect.withSpan("@goho/RecipeUploadRepository.markAbandonedFailed"),
    );

    return Service.of({
      createQueued,
      deleteFailed,
      findById,
      list,
      markAbandonedFailed,
      markFailed,
      markProcessing,
      markSucceeded,
    });
  }),
);
