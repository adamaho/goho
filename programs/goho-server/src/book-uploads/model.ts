import {
  BookUploadContentType,
  BookUploadFailureCode,
  BookUploadId,
  BookUploadStatus,
} from "@goho/goho-api/book-uploads";
import { BookId } from "@goho/goho-api/books";
import { Schema } from "effect";

import { FileId } from "#src/file-storage.ts";
import { NonEmptyText } from "#src/schema.ts";

/**
 * Metadata required to create a queued cover upload after its file has been stored.
 *
 * @category models
 * @since 0.1.0
 */
export const QueuedBookUpload = Schema.Struct({
  id: BookUploadId,
  fileId: FileId,
  fileName: NonEmptyText,
  contentType: BookUploadContentType,
});

/**
 * Metadata required to create a queued cover upload.
 *
 * @category models
 * @since 0.1.0
 */
export interface QueuedBookUpload extends Schema.Schema.Type<typeof QueuedBookUpload> {}

/**
 * Persisted cover upload and its current processing outcome.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUpload = Schema.Struct({
  ...QueuedBookUpload.fields,
  status: BookUploadStatus,
  bookId: Schema.NullOr(BookId),
  failureCode: Schema.NullOr(BookUploadFailureCode),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

/**
 * Persisted cover upload and its current processing outcome.
 *
 * @category models
 * @since 0.1.0
 */
export interface BookUpload extends Schema.Schema.Type<typeof BookUpload> {}
