import {
  type BookUpload as PublicBookUpload,
  BookUploadContentType,
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
  readonly list: Effect.Effect<ReadonlyArray<PublicBookUpload>, BookUploadsUnavailable>;
  readonly create: (input: UploadInput) => Effect.Effect<PublicBookUpload, BookUploadsUnavailable>;
  readonly get: (
    uploadId: BookUploadId,
  ) => Effect.Effect<PublicBookUpload, BookUploadNotFound | BookUploadsUnavailable>;
}

/**
 * Creates cover uploads and retrieves their durable status.
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

    const create = Effect.fn("@goho/BookUploads.create")(
      function* (input: UploadInput) {
        const uploadId = BookUploadId.make(yield* crypto.randomUUIDv4());
        const file = yield* Schema.decodeEffect(UploadInput)(input);
        const fileId = yield* storage.put(file);
        const upload = yield* transaction
          .run(
            Effect.gen(function* () {
              const created = yield* repository.createQueued({
                id: uploadId,
                fileId,
                fileName: file.name,
                contentType: file.contentType,
              });
              yield* queue.offer({ uploadId });
              return created;
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
          );
        return toPublic(upload);
      },
      Effect.catchCause((cause) =>
        Effect.logError("Book upload could not be stored and queued", cause).pipe(
          Effect.andThen(Effect.fail(new BookUploadsUnavailable())),
        ),
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

    return Service.of({ create, get, list });
  }),
);
