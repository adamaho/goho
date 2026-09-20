import { randomUUID } from "node:crypto";

import {
  type ReceiptUpload as PublicReceiptUpload,
  ReceiptUploadContentType,
  ReceiptUploadId,
} from "@goho/goho-server-client/receipt-uploads";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";

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
  readonly create: (
    input: UploadInput,
  ) => Effect.Effect<PublicReceiptUpload, HttpApiError.InternalServerError>;
  readonly get: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<PublicReceiptUpload, HttpApiError.NotFound | HttpApiError.InternalServerError>;
}

/**
 * Creates uploads and retrieves their durable status.
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
    const sql = yield* SqlClient.SqlClient;

    const create = Effect.fn("@goho/ReceiptUploads.create")(
      function* (input: UploadInput) {
        const uploadId = ReceiptUploadId.make(randomUUID());
        const file = yield* Schema.decodeEffect(UploadInput)(input);
        const fileId = yield* storage.put(file);
        const upload = yield* sql.withTransaction(
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

    return Service.of({ create, get });
  }),
);
