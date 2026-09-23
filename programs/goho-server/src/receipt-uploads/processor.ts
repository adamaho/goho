import { Ai } from "@goho/core";
import { ReceiptUploadFailureCode } from "@goho/goho-api/receipt-uploads";
import { Effect, Layer, Schedule, Schema } from "effect";

import * as FileStorage from "#src/file-storage.ts";
import * as ReceiptExtraction from "#src/receipts/extraction.ts";
import * as ReceiptModel from "#src/receipts/model.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";

import { maxAttempts, type ReceiptUploadJob, Service as ReceiptUploadQueue } from "./queue.ts";
import * as ReceiptUploadRepository from "./repository.ts";

class ProcessingError extends Schema.TaggedError<ProcessingError>()(
  "GohoServer.ReceiptUploads.ProcessingError",
  { failureCode: ReceiptUploadFailureCode, cause: Schema.Defect() },
) {}

const failAs = (failureCode: ReceiptUploadFailureCode) =>
  Effect.mapError((cause: unknown) => new ProcessingError({ failureCode, cause }));

/**
 * Processes one persisted queue delivery and records its terminal status.
 *
 * @category workflows
 * @since 0.1.0
 */
export const process: (
  job: ReceiptUploadJob,
  metadata: { readonly id: string; readonly attempts: number },
) => Effect.Effect<
  void,
  ProcessingError,
  Ai.Service | FileStorage.Service | ReceiptRepository.Service | ReceiptUploadRepository.Service
> = Effect.fn("@goho/ReceiptUploads.process")(function* (
  job: ReceiptUploadJob,
  metadata: { readonly id: string; readonly attempts: number },
) {
  return yield* Effect.gen(function* () {
    const uploads = yield* ReceiptUploadRepository.Service;
    const storage = yield* FileStorage.Service;
    const receipts = yield* ReceiptRepository.Service;

    const upload = yield* uploads.markProcessing(job.uploadId).pipe(
      Effect.catchTag("GohoServer.ReceiptUploadRepository.UploadNotFound", () =>
        Effect.logWarning("Discarding a receipt upload job without an upload row", {
          uploadId: job.uploadId,
        }).pipe(Effect.as(null)),
      ),
      failAs("internal_error"),
    );
    if (upload === null) return;

    const bytes = yield* storage.get(upload.fileId).pipe(failAs("storage_failed"));
    const parsed = yield* ReceiptExtraction.extract({
      bytes,
      fileName: upload.fileName,
      contentType: upload.contentType,
    }).pipe(failAs("processing_failed"));
    const result = yield* receipts
      .save(
        ReceiptModel.prepareReceipt(parsed, {
          provider: "file_storage",
          fileId: upload.fileId,
          fileName: upload.fileName,
        }),
      )
      .pipe(failAs("receipt_creation_failed"));
    yield* uploads.markSucceeded(upload.id, result.receiptId).pipe(failAs("internal_error"));
  }).pipe(
    Effect.catchTag("GohoServer.ReceiptUploads.ProcessingError", (error) =>
      Effect.gen(function* () {
        if (metadata.attempts >= maxAttempts) {
          yield* ReceiptUploadRepository.Service.pipe(
            Effect.flatMap((uploads) => uploads.markFailed(job.uploadId, error.failureCode)),
            Effect.retry(Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 2 }))),
            Effect.catchCause((cause) =>
              Effect.logError("Receipt upload terminal failure could not be recorded", cause),
            ),
          );
        }
        return yield* error;
      }),
    ),
  );
});

/** Runs the receipt upload consumer for the lifetime of the application scope. */
const run = Effect.gen(function* () {
  const queue = yield* ReceiptUploadQueue;
  yield* queue.take(process);
}).pipe(
  Effect.catch((error) =>
    Effect.logError("Receipt upload worker attempt failed", error).pipe(Effect.delay("1 second")),
  ),
  Effect.forever,
);

/**
 * Runs the receipt upload consumer for the lifetime of the application scope.
 * Forking lets layer acquisition finish; closing the scope interrupts the worker.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effectDiscard(Effect.forkScoped(run));
