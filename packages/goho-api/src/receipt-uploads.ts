import { Schema } from "effect";

import { ReceiptId } from "./receipts.ts";

/**
 * Identity of a receipt upload and its queued job.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("ReceiptUploadId"),
);

/**
 * Identity of a receipt upload and its queued job.
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
 * Image format accepted by the receipt upload workflow.
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
 * Public status of a receipt upload.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUpload = Schema.Struct({
  id: ReceiptUploadId,
  fileName: Schema.String,
  contentType: ReceiptUploadContentType,
  status: ReceiptUploadStatus,
  receiptId: Schema.NullOr(ReceiptId),
  failureCode: Schema.NullOr(ReceiptUploadFailureCode),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

/**
 * Public status of a receipt upload.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptUpload extends Schema.Schema.Type<typeof ReceiptUpload> {}
