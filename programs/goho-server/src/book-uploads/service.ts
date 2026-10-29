import {
  type BookUpload as PublicBookUpload,
  BookUploadConflict,
  BookUploadContentType,
  BookUploadGone,
  BookUploadId,
  BookUploadNotFound,
  BookUploadsUnavailable,
} from "@goho/goho-api/book-uploads";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import { NonEmptyText } from "#src/schema.ts";

import type { BookUpload } from "./model.ts";
import * as BookUploadQueue from "./queue.ts";
import * as BookUploadRepository from "./repository.ts";

/**
 * One cover image accepted from the HTTP boundary.
 *
 * @category models
 * @since 0.1.0
 */
export const UploadInput = Schema.Struct({
  name: NonEmptyText,
  contentType: BookUploadContentType,
  bytes: Schema.Uint8Array,
});

/**
 * One cover image accepted from the HTTP boundary.
 *
 * @category models
 * @since 0.1.0
 */
export interface UploadInput extends Schema.Schema.Type<typeof UploadInput> {}

// Persistence and storage details stay in the logs; callers see the domain error.
const unavailable = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new BookUploadsUnavailable())));

const toPublic = (upload: BookUpload): PublicBookUpload => ({
  id: upload.id,
  fileName: upload.fileName,
  contentType: upload.contentType,
  status: upload.status,
  bookId: upload.bookId,
  failureCode: upload.failureCode,
  createdAt: upload.createdAt,
  updatedAt: upload.updatedAt,
});

/**
 * Cover upload operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /** Deletes a failed upload and its stored file; other states fail with a conflict. */
  readonly delete: (
    uploadId: BookUploadId,
  ) => Effect.Effect<void, BookUploadNotFound | BookUploadConflict | BookUploadsUnavailable>;
  readonly list: Effect.Effect<ReadonlyArray<PublicBookUpload>, BookUploadsUnavailable>;
  /**
   * Stores and queues one upload. An `idempotencyKey` becomes the upload's ID;
   * when that upload already exists, including one a concurrent request is
   * creating, it is returned as it stands and nothing more is stored or queued.
   * A key whose upload was deleted fails with `BookUploadGone`, since IDs are
   * never reused.
   */
  readonly create: (
    input: UploadInput,
    idempotencyKey?: BookUploadId,
  ) => Effect.Effect<PublicBookUpload, BookUploadGone | BookUploadsUnavailable>;
  readonly get: (
    uploadId: BookUploadId,
  ) => Effect.Effect<PublicBookUpload, BookUploadNotFound | BookUploadsUnavailable>;
}

/**
 * Creates cover uploads, retrieves their durable status, and deletes failed ones.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/BookUploads",
) {}

/**
 * Stores each file before atomically creating its upload row and queue job.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const storage = yield* FileStorage.Service;
    const repository = yield* BookUploadRepository.Service;
    const queue = yield* BookUploadQueue.Service;
    const transaction = yield* Transaction.Service;
    const crypto = yield* Crypto.Crypto;

    const deletionFailed = unavailable("Book upload deletion failed");

    const deleteUpload = Effect.fn("@goho/BookUploads.deleteUpload")(
      (uploadId: BookUploadId) =>
        transaction.run(
          Effect.gen(function* () {
            const fileId = yield* repository.deleteFailed(uploadId);
            yield* storage.delete(fileId);
          }),
        ),
      Effect.catchTags({
        "GohoServer.BookUploadRepository.UploadNotFound": () =>
          Effect.fail(new BookUploadNotFound()),
        "GohoServer.BookUploadRepository.DeletionNotAllowed": () =>
          Effect.fail(new BookUploadConflict()),
        "GohoServer.BookUploadRepository.PersistenceError": deletionFailed,
        "GohoServer.FileStorage.StorageError": deletionFailed,
        "GohoServer.Database.TransactionError": deletionFailed,
      }),
    );

    const create = Effect.fn("@goho/BookUploads.create")(
      // Succeeds with none when the key's upload was accepted and since deleted.
      function* (input: UploadInput, idempotencyKey?: BookUploadId) {
        // An ID is issued in the same transaction as its upload row, so an issued
        // key without a row means the upload was deleted.
        if (idempotencyKey !== undefined && (yield* repository.hasIssuedId(idempotencyKey))) {
          return yield* repository.findById(idempotencyKey);
        }
        const uploadId = idempotencyKey ?? BookUploadId.make(yield* crypto.randomUUIDv4());
        const file = yield* Schema.decodeEffect(UploadInput)(input);
        const fileId = yield* storage.put(file);
        return yield* transaction
          .run(
            Effect.gen(function* () {
              const created = yield* repository.createQueued({
                id: uploadId,
                fileId,
                fileName: file.name,
                contentType: file.contentType,
              });
              yield* queue.offer({ uploadId });
              return Option.some(created);
            }),
          )
          .pipe(
            Effect.catchCause((cause) =>
              storage.delete(fileId).pipe(
                Effect.catchCause((cleanupCause) =>
                  Effect.logError(
                    "Orphaned book upload file could not be deleted",
                    cleanupCause,
                  ).pipe(Effect.annotateLogs({ fileId })),
                ),
                Effect.andThen(Effect.failCause(cause)),
              ),
            ),
            // A concurrent request with the same key committed first; its upload
            // keeps the only file and queue job, so this request returns it.
            Effect.catchTag("GohoServer.BookUploadRepository.UploadIdTaken", (error) =>
              Effect.gen(function* () {
                if (idempotencyKey === undefined) return yield* error;
                return yield* repository.findById(uploadId);
              }),
            ),
          );
      },
      Effect.catchCause((cause) =>
        Effect.logError("Book upload could not be stored and queued", cause).pipe(
          Effect.andThen(Effect.fail(new BookUploadsUnavailable())),
        ),
      ),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new BookUploadGone()),
          onSome: (upload) => Effect.succeed(toPublic(upload)),
        }),
      ),
      Effect.uninterruptible,
    );

    const get = Effect.fn("@goho/BookUploads.get")(
      (uploadId: BookUploadId) =>
        repository.findById(uploadId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new BookUploadNotFound()),
              onSome: (upload) => Effect.succeed(toPublic(upload)),
            }),
          ),
        ),
      Effect.catchTag(
        "GohoServer.BookUploadRepository.PersistenceError",
        unavailable("Book upload retrieval failed"),
      ),
    );

    const list = repository.list.pipe(
      Effect.map((uploads) => uploads.map(toPublic)),
      Effect.catchTag(
        "GohoServer.BookUploadRepository.PersistenceError",
        unavailable("Book upload listing failed"),
      ),
      Effect.withSpan("@goho/BookUploads.list"),
    );

    return Service.of({ create, delete: deleteUpload, get, list });
  }),
);
