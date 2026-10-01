import {
  ReceiptUploadFailureCode,
  ReceiptUploadId,
  ReceiptUploadStatus,
} from "@goho/goho-api/receipt-uploads";
import { ReceiptId } from "@goho/goho-api/receipts";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { FileId } from "#src/file-storage.ts";
import { ReceiptIdFromDatabase } from "#src/schema.ts";

import { QueuedReceiptUpload, type ReceiptExtraction, ReceiptUpload } from "./model.ts";

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

/**
 * Only failed uploads may be deleted directly.
 *
 * @category errors
 * @since 0.1.0
 */
export class DeletionNotAllowed extends Schema.TaggedError<DeletionNotAllowed>()(
  "GohoServer.ReceiptUploadRepository.DeletionNotAllowed",
  { uploadId: ReceiptUploadId, currentStatus: ReceiptUploadStatus },
) {}

type TransitionError = PersistenceError | UploadNotFound | InvalidTransition;

/**
 * Receipt upload persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly deleteFailed: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<FileId, PersistenceError | UploadNotFound | DeletionNotAllowed>;
  readonly list: Effect.Effect<ReadonlyArray<ReceiptUpload>, PersistenceError>;
  readonly createQueued: (
    upload: QueuedReceiptUpload,
  ) => Effect.Effect<ReceiptUpload, PersistenceError>;
  readonly findById: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<Option.Option<ReceiptUpload>, PersistenceError>;
  readonly findByReceiptId: (
    receiptId: ReceiptId,
  ) => Effect.Effect<Option.Option<ReceiptUpload>, PersistenceError>;
  readonly markProcessing: (
    uploadId: ReceiptUploadId,
  ) => Effect.Effect<ReceiptUpload, TransitionError>;
  readonly markSucceeded: (
    uploadId: ReceiptUploadId,
    receiptId: ReceiptId,
    extraction: ReceiptExtraction,
  ) => Effect.Effect<ReceiptUpload, TransitionError>;
  readonly markFailed: (
    uploadId: ReceiptUploadId,
    failureCode: ReceiptUploadFailureCode,
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
  file_id: FileId,
  file_name: Schema.String,
  content_type: ReceiptUpload.fields.contentType,
  status: ReceiptUploadStatus,
  receipt_id: Schema.NullOr(ReceiptIdFromDatabase),
  failure_code: Schema.NullOr(ReceiptUploadFailureCode),
  created_at: Schema.String,
  updated_at: Schema.String,
});
type ReceiptUploadRow = typeof ReceiptUploadRow.Type;

const fromRow = (row: ReceiptUploadRow): ReceiptUpload => ({
  id: row.id,
  fileId: row.file_id,
  fileName: row.file_name,
  contentType: row.content_type,
  status: row.status,
  receiptId: row.receipt_id,
  failureCode: row.failure_code,
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

    const columns = sql.literal(`
      id, file_id, file_name, content_type, status, receipt_id,
      failure_code, created_at::text, updated_at::text
    `);

    const persistenceError = (operation: string) =>
      Effect.mapError((cause: unknown) => new PersistenceError({ operation, cause }));

    const selectById = SqlSchema.findOneOption({
      Request: ReceiptUploadId,
      Result: ReceiptUploadRow,
      execute: (uploadId) => sql`SELECT ${columns} FROM receipt_uploads WHERE id = ${uploadId}`,
    });

    const deleteFailedRow = SqlSchema.findOneOption({
      Request: ReceiptUploadId,
      Result: Schema.Struct({ file_id: FileId }),
      execute: (uploadId) => sql`
        DELETE FROM receipt_uploads WHERE id = ${uploadId} AND status = 'failed'
        RETURNING file_id
      `,
    });

    const selectSucceededByReceiptId = SqlSchema.findOneOption({
      Request: ReceiptId,
      Result: ReceiptUploadRow,
      execute: (receiptId) => sql`
        SELECT ${columns} FROM receipt_uploads
        WHERE receipt_id = ${receiptId} AND status = 'succeeded'
      `,
    });

    const selectAll = SqlSchema.findAll({
      Request: Schema.Void,
      Result: ReceiptUploadRow,
      execute: () => sql`
        SELECT ${columns} FROM receipt_uploads ORDER BY created_at DESC, id DESC
      `,
    });

    const insertQueued = SqlSchema.findOne({
      Request: QueuedReceiptUpload,
      Result: ReceiptUploadRow,
      execute: (upload) => sql`
        INSERT INTO receipt_uploads (id, file_id, file_name, content_type, status)
        VALUES (${upload.id}, ${upload.fileId}, ${upload.fileName}, ${upload.contentType}, 'queued')
        RETURNING ${columns}
      `,
    });

    const updateToProcessing = SqlSchema.findOneOption({
      Request: ReceiptUploadId,
      Result: ReceiptUploadRow,
      execute: (uploadId) => sql`
        UPDATE receipt_uploads SET status = 'processing', updated_at = now()
        WHERE id = ${uploadId} AND status IN ('queued', 'processing')
        RETURNING ${columns}
      `,
    });

    const updateToSucceeded = SqlSchema.findOneOption({
      Request: Schema.Struct({
        uploadId: ReceiptUploadId,
        receiptId: ReceiptId,
        extractionVersion: Schema.Int,
        extractedPayload: Schema.String,
      }),
      Result: ReceiptUploadRow,
      execute: (request) => sql`
        UPDATE receipt_uploads
        SET status = 'succeeded', receipt_id = ${request.receiptId},
          extraction_version = ${request.extractionVersion},
          extracted_payload = ${request.extractedPayload}::jsonb,
          updated_at = now()
        WHERE id = ${request.uploadId} AND status = 'processing'
        RETURNING ${columns}
      `,
    });

    const updateToFailed = SqlSchema.findOneOption({
      Request: Schema.Struct({ uploadId: ReceiptUploadId, failureCode: ReceiptUploadFailureCode }),
      Result: ReceiptUploadRow,
      execute: (request) => sql`
        UPDATE receipt_uploads
        SET status = 'failed', failure_code = ${request.failureCode}, updated_at = now()
        WHERE id = ${request.uploadId} AND status IN ('queued', 'processing')
        RETURNING ${columns}
      `,
    });

    const findById = Effect.fn("@goho/ReceiptUploadRepository.findById")(
      (uploadId: ReceiptUploadId) => selectById(uploadId).pipe(Effect.map(Option.map(fromRow))),
      persistenceError("findById"),
    );

    const deleteFailed = Effect.fn("@goho/ReceiptUploadRepository.deleteFailed")(function* (
      uploadId: ReceiptUploadId,
    ) {
      // Guard deletion in SQL so active or successful work cannot lose its upload.
      const deleted = yield* deleteFailedRow(uploadId).pipe(persistenceError("deleteFailed"));
      if (Option.isSome(deleted)) return deleted.value.file_id;
      const current = yield* findById(uploadId);
      if (Option.isNone(current)) return yield* new UploadNotFound({ uploadId });
      return yield* new DeletionNotAllowed({ uploadId, currentStatus: current.value.status });
    });

    const findByReceiptId = Effect.fn("@goho/ReceiptUploadRepository.findByReceiptId")(
      (receiptId: ReceiptId) =>
        selectSucceededByReceiptId(receiptId).pipe(Effect.map(Option.map(fromRow))),
      persistenceError("findByReceiptId"),
    );

    const list = selectAll(undefined).pipe(
      Effect.map((rows) => rows.map(fromRow)),
      persistenceError("list"),
      Effect.withSpan("@goho/ReceiptUploadRepository.list"),
    );

    const createQueued = Effect.fn("@goho/ReceiptUploadRepository.createQueued")(function* (
      input: QueuedReceiptUpload,
    ) {
      const upload = yield* Schema.decodeEffect(QueuedReceiptUpload)(input);
      return fromRow(yield* insertQueued(upload));
    }, persistenceError("createQueued"));
    // A guarded update that matched no row either lost the upload or found it in
    // a state that does not allow the requested transition.

    const transition = Effect.fnUntraced(function* <E>(
      operation: string,
      uploadId: ReceiptUploadId,
      requestedStatus: ReceiptUploadStatus,
      update: Effect.Effect<Option.Option<ReceiptUploadRow>, E>,
    ) {
      const updated = yield* update.pipe(persistenceError(operation));
      if (Option.isSome(updated)) return fromRow(updated.value);
      const current = yield* findById(uploadId);
      if (Option.isNone(current)) return yield* new UploadNotFound({ uploadId });
      return yield* new InvalidTransition({
        uploadId,
        currentStatus: current.value.status,
        requestedStatus,
      });
    });

    const markProcessing = Effect.fn("@goho/ReceiptUploadRepository.markProcessing")(
      (uploadId: ReceiptUploadId) =>
        transition("markProcessing", uploadId, "processing", updateToProcessing(uploadId)),
    );

    const markSucceeded = Effect.fn("@goho/ReceiptUploadRepository.markSucceeded")(
      (uploadId: ReceiptUploadId, receiptId: ReceiptId, extraction: ReceiptExtraction) =>
        transition(
          "markSucceeded",
          uploadId,
          "succeeded",
          updateToSucceeded({
            uploadId,
            receiptId,
            extractionVersion: extraction.version,
            extractedPayload: JSON.stringify(extraction.payload),
          }),
        ),
    );

    const markFailed = Effect.fn("@goho/ReceiptUploadRepository.markFailed")(
      (uploadId: ReceiptUploadId, failureCode: ReceiptUploadFailureCode) =>
        transition("markFailed", uploadId, "failed", updateToFailed({ uploadId, failureCode })),
    );

    return Service.of({
      createQueued,
      deleteFailed,
      findById,
      findByReceiptId,
      list,
      markFailed,
      markProcessing,
      markSucceeded,
    });
  }),
);
