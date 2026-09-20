import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Schema } from "effect";

const NonEmptyText = Schema.Trim.check(Schema.isNonEmpty());

/**
 * Identity shared by an upload and its future persisted queue job.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
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
 * Metadata required to create a queued upload after its file has been stored.
 *
 * @category models
 * @since 0.1.0
 */
export const QueuedReceiptUpload = Schema.Struct({
  id: ReceiptUploadId,
  storageKey: NonEmptyText,
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
  error: Schema.NullOr(Schema.String),
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
