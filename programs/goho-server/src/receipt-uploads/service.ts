import {
  type ReceiptUpload as PublicReceiptUpload,
  ReceiptUploadContentType,
  ReceiptUploadId,
} from "@goho/goho-api/receipt-uploads";
import { ReceiptId } from "@goho/goho-api/receipts";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import { NonEmptyText } from "#src/schema.ts";

import type { ReceiptUpload } from "./model.ts";
import * as ReceiptUploadQueue from "./queue.ts";
import * as ReceiptUploadRepository from "./repository.ts";

/**
 * One receipt image accepted from the HTTP boundary.
 *
 * @category models
 * @since 0.1.0
 */
export const UploadInput = Schema.Struct({
  name: NonEmptyText,
  contentType: ReceiptUploadContentType,
  bytes: Schema.Uint8Array,
});

/**
 * One receipt image accepted from the HTTP boundary.
 *
 * @category models
 * @since 0.1.0
 */
export interface UploadInput extends Schema.Schema.Type<typeof UploadInput> {}

const deletionFailed = (error: unknown) =>
  Effect.logError("Receipt upload deletion failed", error).pipe(
    Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
  );

const toPublic = (upload: ReceiptUpload): PublicReceiptUpload => ({
  id: upload.id,
  fileName: upload.fileName,
  contentType: upload.contentType,
  status: upload.status,
  receiptId: upload.receiptId,
  failureCode: upload.failureCode,
  createdAt: upload.createdAt,
  updatedAt: upload.updatedAt,
});

/**
 * Receipt upload operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly delete: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<
    void,
    HttpApiError.NotFound | HttpApiError.Conflict | HttpApiError.InternalServerError
  >;
  readonly list: Effect.Effect<
    ReadonlyArray<PublicReceiptUpload>,
    HttpApiError.InternalServerError
  >;
  readonly create: (
    input: UploadInput,
  ) => Effect.Effect<PublicReceiptUpload, HttpApiError.InternalServerError>;
  readonly get: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<PublicReceiptUpload, HttpApiError.NotFound | HttpApiError.InternalServerError>;
  readonly getImage: (
    receiptId: ReceiptId,
  ) => Effect.Effect<
    { readonly bytes: Uint8Array; readonly contentType: string },
    HttpApiError.NotFound | HttpApiError.InternalServerError
  >;
}

/**
 * Creates uploads, retrieves their durable status, and deletes failed uploads.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/ReceiptUploads",
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
    const repository = yield* ReceiptUploadRepository.Service;
    const queue = yield* ReceiptUploadQueue.Service;
    const transaction = yield* Transaction.Service;
    const crypto = yield* Crypto.Crypto;

    const deleteUpload = Effect.fn("@goho/ReceiptUploads.deleteUpload")(
      (uploadId: ReceiptUploadId) =>
        transaction.run(
          Effect.gen(function* () {
            const fileId = yield* repository.deleteFailed(uploadId);
            yield* storage.delete(fileId);
          }),
        ),
      Effect.catchTags({
        "GohoServer.ReceiptUploadRepository.UploadNotFound": () =>
          Effect.fail(new HttpApiError.NotFound()),
        "GohoServer.ReceiptUploadRepository.DeletionNotAllowed": () =>
          Effect.fail(new HttpApiError.Conflict()),
        "GohoServer.ReceiptUploadRepository.PersistenceError": deletionFailed,
        "GohoServer.FileStorage.StorageError": deletionFailed,
        "GohoServer.Database.TransactionError": deletionFailed,
      }),
    );

    const create = Effect.fn("@goho/ReceiptUploads.create")(
      function* (input: UploadInput) {
        const uploadId = ReceiptUploadId.make(yield* crypto.randomUUIDv4);
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
                    "Orphaned receipt upload file could not be deleted",
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
        Effect.logError("Receipt upload could not be stored and queued", cause).pipe(
          Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
        ),
      ),
      Effect.uninterruptible,
    );

    const get = Effect.fn("@goho/ReceiptUploads.get")((uploadId: ReceiptUploadId) =>
      repository.findById(uploadId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new HttpApiError.NotFound()),
            onSome: (upload) => Effect.succeed(toPublic(upload)),
          }),
        ),
        Effect.catchTag("GohoServer.ReceiptUploadRepository.PersistenceError", (error) =>
          Effect.logError("Receipt upload retrieval failed", error).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
        ),
      ),
    );

    const list = repository.list.pipe(
      Effect.map((uploads) => uploads.map(toPublic)),
      Effect.catchTag("GohoServer.ReceiptUploadRepository.PersistenceError", (error) =>
        Effect.logError("Receipt upload listing failed", error).pipe(
          Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
        ),
      ),
      Effect.withSpan("@goho/ReceiptUploads.list"),
    );

    const getImage = Effect.fn("@goho/ReceiptUploads.getImage")((receiptId: ReceiptId) =>
      Effect.gen(function* () {
        const found = yield* repository.findByReceiptId(receiptId);
        if (Option.isNone(found)) return yield* new HttpApiError.NotFound();
        const bytes = yield* storage.get(found.value.fileId);
        return { bytes, contentType: found.value.contentType };
      }).pipe(
        Effect.catchTags({
          "GohoServer.ReceiptUploadRepository.PersistenceError": (error) =>
            Effect.logError("Receipt image lookup failed", error).pipe(
              Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
            ),
          "GohoServer.FileStorage.StorageError": (error) =>
            Effect.logError("Receipt image retrieval failed", error).pipe(
              Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
            ),
        }),
      ),
    );

    return Service.of({ create, delete: deleteUpload, get, getImage, list });
  }),
);
