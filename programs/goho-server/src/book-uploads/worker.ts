import { Ai } from "@goho/core";
import { BookUploadFailureCode } from "@goho/goho-api/book-uploads";
import { Array, Effect, Layer, Schedule, Schema } from "effect";

import * as BookExtraction from "#src/books/extraction.ts";
import * as BookRepository from "#src/books/repository.ts";
import * as CategoryRepository from "#src/categories/repository.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as QueueConstants from "#src/queues/constants.ts";

import { type BookUploadJob, Service as BookUploadQueue } from "./queue.ts";
import * as BookUploadRepository from "./repository.ts";

class ProcessingError extends Schema.TaggedError<ProcessingError>()(
  "GohoServer.BookUploads.ProcessingError",
  { failureCode: BookUploadFailureCode, cause: Schema.Defect() },
) {}

const failAs = (failureCode: BookUploadFailureCode) =>
  Effect.mapError((cause: unknown) => new ProcessingError({ failureCode, cause }));

/**
 * Processes one persisted queue delivery and records its terminal status. The
 * scanned book is saved, or the saved book with its identity reused unchanged,
 * in the transaction that marks the upload succeeded.
 *
 * @category workflows
 * @since 0.1.0
 */
export const process: (
  job: BookUploadJob,
  metadata: { readonly id: string; readonly attempts: number },
) => Effect.Effect<
  void,
  ProcessingError,
  | Ai.Service
  | BookRepository.Service
  | BookUploadRepository.Service
  | CategoryRepository.Service
  | FileStorage.Service
  | Transaction.Service
> = Effect.fn("@goho/BookUploads.process")(function* (
  job: BookUploadJob,
  metadata: { readonly id: string; readonly attempts: number },
) {
  return yield* Effect.gen(function* () {
    const uploads = yield* BookUploadRepository.Service;
    const storage = yield* FileStorage.Service;
    const books = yield* BookRepository.Service;
    const categories = yield* CategoryRepository.Service;
    const transaction = yield* Transaction.Service;

    // A finished upload means another delivery already recorded its outcome.
    const upload = yield* uploads.markProcessing(job.uploadId).pipe(
      Effect.catchTags({
        "GohoServer.BookUploadRepository.UploadNotFound": () =>
          Effect.logWarning("Discarding a book upload job without an upload row", {
            uploadId: job.uploadId,
          }).pipe(Effect.as(null)),
        "GohoServer.BookUploadRepository.InvalidTransition": (error) =>
          Effect.logInfo("Discarding a book upload job for a finished upload", {
            uploadId: job.uploadId,
            status: error.currentStatus,
          }).pipe(Effect.as(null)),
      }),
      failAs("internal_error"),
    );
    if (upload === null) return;

    const bytes = yield* storage.get(upload.fileId).pipe(failAs("storage_failed"));
    // Read on every attempt so the model sees categories saved since the last one.
    const categoryNames = yield* categories
      .listNamesForCategory("book")
      .pipe(failAs("internal_error"));
    // A book can only be classified into an existing category, so there must be one.
    if (!Array.isReadonlyArrayNonEmpty(categoryNames)) {
      return yield* new ProcessingError({
        failureCode: "internal_error",
        cause: "The book category catalog is empty",
      });
    }
    const parsed = yield* BookExtraction.extract({
      bytes,
      fileName: upload.fileName,
      contentType: upload.contentType,
      categories: categoryNames,
    }).pipe(failAs("processing_failed"));
    const extraction = { version: BookExtraction.extractionVersion, payload: parsed };
    // A failed status change rolls back a new book with it; a reused book is unchanged.
    yield* transaction
      .run(
        Effect.gen(function* () {
          // A scan sets no reading level, and reuse keeps the saved one.
          const book = yield* books
            .findOrCreate({ title: parsed.title, author: parsed.author, category: parsed.category })
            .pipe(failAs("book_creation_failed"));
          yield* uploads
            .markSucceeded(upload.id, book.id, extraction)
            .pipe(failAs("internal_error"));
        }),
      )
      .pipe(Effect.catchTag("GohoServer.Database.TransactionError", failAs("internal_error")));
  }).pipe(
    Effect.catchTag("GohoServer.BookUploads.ProcessingError", (error) =>
      Effect.gen(function* () {
        if (metadata.attempts >= QueueConstants.maxAttempts) {
          yield* BookUploadRepository.Service.pipe(
            Effect.flatMap((uploads) => uploads.markFailed(job.uploadId, error.failureCode)),
            Effect.retry(Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 2 }))),
            Effect.catchCause((cause) =>
              Effect.logError("Book upload terminal failure could not be recorded", cause),
            ),
          );
        }
        return yield* error;
      }),
    ),
  );
});

/** Runs the book upload consumer for the lifetime of the application scope. */
const run = Effect.gen(function* () {
  const queue = yield* BookUploadQueue;
  yield* queue.take(process);
}).pipe(
  Effect.catch((error) =>
    Effect.logError("Book upload worker attempt failed", error).pipe(Effect.delay("1 second")),
  ),
  Effect.forever,
);

/**
 * Fails uploads whose queue job failed without the worker recording it, such as
 * after a crash during the final attempt. Runs at startup, then every 30 seconds.
 */
const recover = BookUploadRepository.Service.pipe(
  Effect.flatMap((uploads) => uploads.markAbandonedFailed),
  Effect.tap((failed) =>
    failed.length === 0
      ? Effect.void
      : Effect.logWarning("Failed book uploads abandoned by the queue", {
          uploadIds: failed.map((upload) => upload.id),
        }),
  ),
  Effect.catchTag("GohoServer.BookUploadRepository.PersistenceError", (error) =>
    Effect.logError("Book upload recovery pass failed", error),
  ),
  Effect.repeat(Schedule.spaced("30 seconds")),
);

/**
 * Runs the book upload consumer and recovery pass for the lifetime of the
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
