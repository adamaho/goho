import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Schema } from "effect";

import { FileId } from "#src/file-storage.ts";
import { NonEmptyText } from "#src/schema.ts";

/**
 * Identity shared by an upload and its future persisted queue job.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("ReceiptUploadId"),
);

/**
 * Persisted receipt upload identity.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptUploadId = typeof ReceiptUploadId.Type;

/**
 * Image formats accepted by the receipt upload workflow.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadContentType = Schema.Literals(["image/jpeg", "image/png", "image/webp"]);

/**
 * Supported receipt image content type.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptUploadContentType = typeof ReceiptUploadContentType.Type;

/**
 * Durable processing state for one uploaded file.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadStatus = Schema.Literals(["queued", "processing", "succeeded", "failed"]);

/**
 * Durable processing state for one uploaded file.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptUploadStatus = typeof ReceiptUploadStatus.Type;

/**
 * Stable reason a receipt upload could not be completed.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadFailureCode = Schema.Literals([
  "unsupported_file_type",
  "storage_failed",
  "processing_failed",
  "receipt_creation_failed",
  "internal_error",
]);

/**
 * Stable reason a receipt upload could not be completed.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptUploadFailureCode = typeof ReceiptUploadFailureCode.Type;

/**
 * Metadata required to create a queued upload after its file has been stored.
 *
 * @category models
 * @since 0.1.0
 */
export const QueuedReceiptUpload = Schema.Struct({
  id: ReceiptUploadId,
  fileId: FileId,
  fileName: NonEmptyText,
  contentType: ReceiptUploadContentType,
});

/**
 * Metadata required to create a queued upload.
 *
 * @category models
 * @since 0.1.0
 */
export interface QueuedReceiptUpload extends Schema.Schema.Type<typeof QueuedReceiptUpload> {}

/**
 * Persisted upload and its current processing outcome.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUpload = Schema.Struct({
  ...QueuedReceiptUpload.fields,
  status: ReceiptUploadStatus,
  receiptId: Schema.NullOr(ReceiptId),
  failureCode: Schema.NullOr(ReceiptUploadFailureCode),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

/**
 * Persisted upload and its current processing outcome.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptUpload extends Schema.Schema.Type<typeof ReceiptUpload> {}
