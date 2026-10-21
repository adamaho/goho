import { Schema } from "effect";

import { BookId } from "./books.ts";

/**
 * Identity of a book cover upload and its queued job.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUploadId = Schema.String.check(Schema.isUUID(4))
  .annotate({
    identifier: "BookUploadId",
    description: "The cover scan's version 4 UUID; use it to check on this upload.",
    examples: ["3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b"],
  })
  .pipe(Schema.brand("BookUploadId"));

/**
 * Identity of a book cover upload and its queued job.
 *
 * @category models
 * @since 0.1.0
 */
export type BookUploadId = typeof BookUploadId.Type;

/**
 * Image formats accepted for book cover scans.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUploadContentType = Schema.Literals(["image/jpeg", "image/png", "image/webp"]);

/**
 * Image format accepted for book cover scans.
 *
 * @category models
 * @since 0.1.0
 */
export type BookUploadContentType = typeof BookUploadContentType.Type;

/**
 * Durable processing state for one cover scan.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUploadStatus = Schema.Literals(["queued", "processing", "succeeded", "failed"]);

/**
 * Durable processing state for one cover scan.
 *
 * @category models
 * @since 0.1.0
 */
export type BookUploadStatus = typeof BookUploadStatus.Type;

/**
 * Stable reason a cover scan could not be completed.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUploadFailureCode = Schema.Literals([
  "storage_failed",
  "processing_failed",
  "book_creation_failed",
  "internal_error",
]);

/**
 * Stable reason a cover scan could not be completed.
 *
 * @category models
 * @since 0.1.0
 */
export type BookUploadFailureCode = typeof BookUploadFailureCode.Type;

/**
 * Public status of a book cover upload.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUpload = Schema.Struct({
  id: BookUploadId,
  fileName: Schema.String.annotate({ description: "File name the scan arrived with." }),
  contentType: BookUploadContentType.annotate({ description: "MIME type of the stored scan." }),
  status: BookUploadStatus.annotate({
    description: "Where the scan is in the play: queued, processing, succeeded, or failed.",
  }),
  bookId: Schema.NullOr(BookId).annotate({
    description:
      "The book this scan saved or matched, once it succeeds; several scans can land on one book.",
  }),
  failureCode: Schema.NullOr(BookUploadFailureCode).annotate({
    description: "Why the scan failed, once it fails; details stay in the server logs.",
  }),
  createdAt: Schema.String.annotate({ description: "When the scan came off the bench." }),
  updatedAt: Schema.String.annotate({ description: "When the scan's status last changed." }),
}).annotate({
  identifier: "BookUpload",
  description: "A cover scan and how its processing is going.",
  examples: [
    {
      id: BookUploadId.make("3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b"),
      fileName: "hobbit-cover.jpg",
      contentType: "image/jpeg",
      status: "succeeded",
      bookId: BookId.make("12"),
      failureCode: null,
      createdAt: "2026-10-20 14:03:11.52+00",
      updatedAt: "2026-10-20 14:03:19.07+00",
    },
  ],
});

/**
 * Public status of a book cover upload.
 *
 * @category models
 * @since 0.1.0
 */
export interface BookUpload extends Schema.Schema.Type<typeof BookUpload> {}

/**
 * No cover upload has the requested ID.
 *
 * @category errors
 * @since 0.1.0
 */
export class BookUploadNotFound extends Schema.Error<BookUploadNotFound>("BookUploadNotFound")(
  Schema.TaggedStruct("BookUploadNotFound", {}).annotate({ identifier: "BookUploadNotFound" }),
  { httpApiStatus: 404, description: "No cover scan is wearing that number, bud." },
) {}

/**
 * Cover uploads could not be stored, read, or deleted; details stay in the
 * server logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class BookUploadsUnavailable extends Schema.Error<BookUploadsUnavailable>(
  "BookUploadsUnavailable",
)(
  Schema.TaggedStruct("BookUploadsUnavailable", {}).annotate({
    identifier: "BookUploadsUnavailable",
  }),
  {
    httpApiStatus: 500,
    description: "The server could not get to the cover scans; take another shot.",
  },
) {}
