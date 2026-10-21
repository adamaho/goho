import { BookUploadFailureCode, BookUploadId, BookUploadStatus } from "@goho/goho-api/book-uploads";
import { BookId } from "@goho/goho-api/books";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import { FileId } from "#src/file-storage.ts";

import { BookUpload, QueuedBookUpload } from "./model.ts";

/**
 * Unexpected failure while validating or persisting a cover upload.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.BookUploadRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * The requested cover upload does not exist.
 *
 * @category errors
 * @since 0.1.0
 */
export class UploadNotFound extends Schema.TaggedError<UploadNotFound>()(
  "GohoServer.BookUploadRepository.UploadNotFound",
  { uploadId: BookUploadId },
) {}

/**
 * The cover upload cannot move from its current state to the requested state.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidTransition extends Schema.TaggedError<InvalidTransition>()(
  "GohoServer.BookUploadRepository.InvalidTransition",
  {
    uploadId: BookUploadId,
    currentStatus: BookUploadStatus,
    requestedStatus: BookUploadStatus,
  },
) {}

/**
 * Only failed cover uploads may be deleted directly.
 *
 * @category errors
 * @since 0.1.0
 */
export class DeletionNotAllowed extends Schema.TaggedError<DeletionNotAllowed>()(
  "GohoServer.BookUploadRepository.DeletionNotAllowed",
  { uploadId: BookUploadId, currentStatus: BookUploadStatus },
) {}

type TransitionError = PersistenceError | UploadNotFound | InvalidTransition;

/**
 * Cover upload persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /** Deletes a failed upload and returns its file ID for the caller to remove. */
  readonly deleteFailed: (
    uploadId: BookUploadId,
  ) => Effect.Effect<FileId, PersistenceError | UploadNotFound | DeletionNotAllowed>;
  readonly list: Effect.Effect<ReadonlyArray<BookUpload>, PersistenceError>;
  readonly createQueued: (upload: QueuedBookUpload) => Effect.Effect<BookUpload, PersistenceError>;
  readonly findById: (
    uploadId: BookUploadId,
  ) => Effect.Effect<Option.Option<BookUpload>, PersistenceError>;
  readonly markProcessing: (uploadId: BookUploadId) => Effect.Effect<BookUpload, TransitionError>;
  readonly markFailed: (
    uploadId: BookUploadId,
    failureCode: BookUploadFailureCode,
  ) => Effect.Effect<BookUpload, TransitionError>;
}

/**
 * Durable state for cover uploads and the books they resolved to.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/BookUploadRepository",
) {}

const BookUploadRow = Schema.Struct({
  id: BookUploadId,
  file_id: FileId,
  file_name: Schema.String,
  content_type: BookUpload.fields.contentType,
  status: BookUploadStatus,
  book_id: Schema.NullOr(BookId),
  failure_code: Schema.NullOr(BookUploadFailureCode),
  created_at: Schema.String,
  updated_at: Schema.String,
});
type BookUploadRow = typeof BookUploadRow.Type;

const fromRow = (row: BookUploadRow): BookUpload => ({
  id: row.id,
  fileId: row.file_id,
  fileName: row.file_name,
  contentType: row.content_type,
  status: row.status,
  bookId: row.book_id,
  failureCode: row.failure_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Stores and transitions cover upload state with guarded SQL updates.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // Text book IDs keep their precision, as on books.
    const columns = sql.literal(`
      id, file_id, file_name, content_type, status, book_id::text AS book_id,
      failure_code, created_at::text, updated_at::text
    `);

    const persistenceError = (operation: string) =>
      Effect.mapError((cause: unknown) => new PersistenceError({ operation, cause }));

    const selectById = SqlSchema.findOneOption({
      Request: BookUploadId,
      Result: BookUploadRow,
      execute: (uploadId) => sql`SELECT ${columns} FROM book_uploads WHERE id = ${uploadId}`,
    });

    const deleteFailedRow = SqlSchema.findOneOption({
      Request: BookUploadId,
      Result: Schema.Struct({ file_id: FileId }),
      execute: (uploadId) => sql`
        DELETE FROM book_uploads WHERE id = ${uploadId} AND status = 'failed'
        RETURNING file_id
      `,
    });

    const selectAll = SqlSchema.findAll({
      Request: Schema.Void,
      Result: BookUploadRow,
      execute: () => sql`
        SELECT ${columns} FROM book_uploads ORDER BY created_at DESC, id DESC
      `,
    });

    const insertQueued = SqlSchema.findOne({
      Request: QueuedBookUpload,
      Result: BookUploadRow,
      execute: (upload) => sql`
        INSERT INTO book_uploads (id, file_id, file_name, content_type, status)
        VALUES (${upload.id}, ${upload.fileId}, ${upload.fileName}, ${upload.contentType}, 'queued')
        RETURNING ${columns}
      `,
    });

    const updateToProcessing = SqlSchema.findOneOption({
      Request: BookUploadId,
      Result: BookUploadRow,
      execute: (uploadId) => sql`
        UPDATE book_uploads SET status = 'processing'
        WHERE id = ${uploadId} AND status IN ('queued', 'processing')
        RETURNING ${columns}
      `,
    });

    const updateToFailed = SqlSchema.findOneOption({
      Request: Schema.Struct({ uploadId: BookUploadId, failureCode: BookUploadFailureCode }),
      Result: BookUploadRow,
      execute: (request) => sql`
        UPDATE book_uploads
        SET status = 'failed', failure_code = ${request.failureCode}
        WHERE id = ${request.uploadId} AND status IN ('queued', 'processing')
        RETURNING ${columns}
      `,
    });

    const findById = Effect.fn("@goho/BookUploadRepository.findById")(
      (uploadId: BookUploadId) => selectById(uploadId).pipe(Effect.map(Option.map(fromRow))),
      persistenceError("findById"),
    );

    const deleteFailed = Effect.fn("@goho/BookUploadRepository.deleteFailed")(function* (
      uploadId: BookUploadId,
    ) {
      // Guard deletion in SQL so active or successful work cannot lose its upload.
      const deleted = yield* deleteFailedRow(uploadId).pipe(persistenceError("deleteFailed"));
      if (Option.isSome(deleted)) return deleted.value.file_id;
      const current = yield* findById(uploadId);
      if (Option.isNone(current)) return yield* new UploadNotFound({ uploadId });
      return yield* new DeletionNotAllowed({ uploadId, currentStatus: current.value.status });
    });

    const list = selectAll(undefined).pipe(
      Effect.map((rows) => rows.map(fromRow)),
      persistenceError("list"),
      Effect.withSpan("@goho/BookUploadRepository.list"),
    );

    const createQueued = Effect.fn("@goho/BookUploadRepository.createQueued")(function* (
      input: QueuedBookUpload,
    ) {
      const upload = yield* Schema.decodeEffect(QueuedBookUpload)(input);
      return fromRow(yield* insertQueued(upload));
    }, persistenceError("createQueued"));

    // A guarded update that matched no row either lost the upload or found it in
    // a state that does not allow the requested transition.
    const transition = Effect.fnUntraced(function* <E>(
      operation: string,
      uploadId: BookUploadId,
      requestedStatus: BookUploadStatus,
      update: Effect.Effect<Option.Option<BookUploadRow>, E>,
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

    const markProcessing = Effect.fn("@goho/BookUploadRepository.markProcessing")(
      (uploadId: BookUploadId) =>
        transition("markProcessing", uploadId, "processing", updateToProcessing(uploadId)),
    );

    const markFailed = Effect.fn("@goho/BookUploadRepository.markFailed")(
      (uploadId: BookUploadId, failureCode: BookUploadFailureCode) =>
        transition("markFailed", uploadId, "failed", updateToFailed({ uploadId, failureCode })),
    );

    return Service.of({
      createQueued,
      deleteFailed,
      findById,
      list,
      markFailed,
      markProcessing,
    });
  }),
);
