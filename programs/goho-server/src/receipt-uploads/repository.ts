import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { ReceiptIdFromDatabase } from "#src/schema.ts";

import {
  QueuedReceiptUpload,
  ReceiptUpload,
  ReceiptUploadId,
  ReceiptUploadStatus,
} from "./model.ts";

/**
 * Unexpected failure while validating or persisting an upload.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.ReceiptUploadRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * The requested upload does not exist.
 *
 * @category errors
 * @since 0.1.0
 */
export class UploadNotFound extends Schema.TaggedError<UploadNotFound>()(
  "GohoServer.ReceiptUploadRepository.UploadNotFound",
  { uploadId: ReceiptUploadId },
) {}

/**
 * The upload cannot move from its current state to the requested state.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidTransition extends Schema.TaggedError<InvalidTransition>()(
  "GohoServer.ReceiptUploadRepository.InvalidTransition",
  {
    uploadId: ReceiptUploadId,
    currentStatus: ReceiptUploadStatus,
    requestedStatus: ReceiptUploadStatus,
  },
) {}

type TransitionError = PersistenceError | UploadNotFound | InvalidTransition;

/**
 * Receipt upload persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly createQueued: (
    upload: QueuedReceiptUpload,
  ) => Effect.Effect<ReceiptUpload, PersistenceError>;
  readonly findById: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<Option.Option<ReceiptUpload>, PersistenceError>;
  readonly markProcessing: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<ReceiptUpload, TransitionError>;
  readonly markSucceeded: (
    uploadId: ReceiptUploadId,
    receiptId: ReceiptId,
  ) => Effect.Effect<ReceiptUpload, TransitionError>;
  readonly markFailed: (
    uploadId: ReceiptUploadId,
    error: string,
  ) => Effect.Effect<ReceiptUpload, TransitionError>;
}

/**
 * Durable state for receipt uploads and their resulting receipt IDs.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/ReceiptUploadRepository",
) {}

const ReceiptUploadRow = Schema.Struct({
  id: ReceiptUploadId,
  storage_key: Schema.String,
  file_name: Schema.String,
  content_type: ReceiptUpload.fields.contentType,
  status: ReceiptUploadStatus,
  receipt_id: Schema.NullOr(ReceiptIdFromDatabase),
  error: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});
type ReceiptUploadRow = typeof ReceiptUploadRow.Type;
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(ReceiptUploadRow));

const fromRow = (row: ReceiptUploadRow): ReceiptUpload => ({
  id: row.id,
  storageKey: row.storage_key,
  fileName: row.file_name,
  contentType: row.content_type,
  status: row.status,
  receiptId: row.receipt_id,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Stores and transitions receipt upload state with guarded SQL updates.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const findById = Effect.fn("@goho/ReceiptUploadRepository.findById")(
      function* (uploadId: ReceiptUploadId) {
        const rows = yield* sql`
          SELECT id, storage_key, file_name, content_type, status, receipt_id,
            error, created_at::text, updated_at::text
          FROM receipt_uploads WHERE id = ${uploadId}
        `.pipe(Effect.flatMap(decodeRows));
        const row = rows.at(0);
        return row === undefined ? Option.none() : Option.some(fromRow(row));
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findById", cause })),
    );
    const resolveMiss = Effect.fn("@goho/ReceiptUploadRepository.resolveMiss")(function* (
      uploadId: ReceiptUploadId,
      requestedStatus: ReceiptUploadStatus,
    ) {
      const current = yield* findById(uploadId);
      if (Option.isNone(current)) return yield* new UploadNotFound({ uploadId });
      return yield* new InvalidTransition({
        uploadId,
        currentStatus: current.value.status,
        requestedStatus,
      });
    });
    const createQueued = Effect.fn("@goho/ReceiptUploadRepository.createQueued")(
      function* (input: QueuedReceiptUpload) {
        const upload = yield* Schema.decodeEffect(QueuedReceiptUpload)(input);
        const rows = yield* sql`
          INSERT INTO receipt_uploads (id, storage_key, file_name, content_type, status)
          VALUES (${upload.id}, ${upload.storageKey}, ${upload.fileName}, ${upload.contentType}, 'queued')
          RETURNING id, storage_key, file_name, content_type, status, receipt_id,
            error, created_at::text, updated_at::text
        `.pipe(Effect.flatMap(decodeRows));
        return fromRow(rows[0]!);
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "createQueued", cause })),
    );
    const markProcessing = Effect.fn("@goho/ReceiptUploadRepository.markProcessing")(function* (
      uploadId: ReceiptUploadId,
    ) {
      const rows = yield* sql`
        UPDATE receipt_uploads SET status = 'processing', updated_at = now()
        WHERE id = ${uploadId} AND status IN ('queued', 'processing')
        RETURNING id, storage_key, file_name, content_type, status, receipt_id,
          error, created_at::text, updated_at::text
      `.pipe(
        Effect.flatMap(decodeRows),
        Effect.mapError((cause) => new PersistenceError({ operation: "markProcessing", cause })),
      );
      const row = rows.at(0);
      return row === undefined ? yield* resolveMiss(uploadId, "processing") : fromRow(row);
    });
    const markSucceeded = Effect.fn("@goho/ReceiptUploadRepository.markSucceeded")(function* (
      uploadId: ReceiptUploadId,
      receiptId: ReceiptId,
    ) {
      const rows = yield* sql`
        UPDATE receipt_uploads
        SET status = 'succeeded', receipt_id = ${receiptId}, updated_at = now()
        WHERE id = ${uploadId} AND status = 'processing'
        RETURNING id, storage_key, file_name, content_type, status, receipt_id,
          error, created_at::text, updated_at::text
      `.pipe(
        Effect.flatMap(decodeRows),
        Effect.mapError((cause) => new PersistenceError({ operation: "markSucceeded", cause })),
      );
      const row = rows.at(0);
      return row === undefined ? yield* resolveMiss(uploadId, "succeeded") : fromRow(row);
    });
    const markFailed = Effect.fn("@goho/ReceiptUploadRepository.markFailed")(function* (
      uploadId: ReceiptUploadId,
      error: string,
    ) {
      const failure = yield* Schema.decodeEffect(NonEmptyFailure)(error).pipe(
        Effect.mapError((cause) => new PersistenceError({ operation: "markFailed", cause })),
      );
      const rows = yield* sql`
        UPDATE receipt_uploads
        SET status = 'failed', error = ${failure}, updated_at = now()
        WHERE id = ${uploadId} AND status IN ('queued', 'processing')
        RETURNING id, storage_key, file_name, content_type, status, receipt_id,
          error, created_at::text, updated_at::text
      `.pipe(
        Effect.flatMap(decodeRows),
        Effect.mapError((cause) => new PersistenceError({ operation: "markFailed", cause })),
      );
      const row = rows.at(0);
      return row === undefined ? yield* resolveMiss(uploadId, "failed") : fromRow(row);
    });
    return Service.of({ createQueued, findById, markProcessing, markSucceeded, markFailed });
  }),
);

const NonEmptyFailure = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0, { expected: "a non-whitespace failure" }),
);
