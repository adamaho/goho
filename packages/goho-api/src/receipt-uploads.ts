import { Schema } from "effect";
import { HttpApiError } from "effect/http-api";

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

/**
 * No receipt upload has the requested ID.
 *
 * @category errors
 * @since 0.1.0
 */
export class ReceiptUploadNotFound extends HttpApiError.Problem<ReceiptUploadNotFound>()(
  "ReceiptUploadNotFound",
  {
    type: "goho:problem:receipt-upload-not-found",
    status: 404,
    title: "Receipt upload not found",
  },
  {},
  { description: "No receipt upload is wearing that number, bud." },
) {}

/**
 * Only failed receipt uploads can be deleted on their own.
 *
 * @category errors
 * @since 0.1.0
 */
export class ReceiptUploadConflict extends HttpApiError.Problem<ReceiptUploadConflict>()(
  "ReceiptUploadConflict",
  {
    type: "goho:problem:receipt-upload-conflict",
    status: 409,
    title: "Receipt upload cannot be deleted",
  },
  {},
  {
    description:
      "Only failed uploads can be deleted; this one is queued, processing, or succeeded. Nothing changed.",
  },
) {}

/**
 * Receipt uploads could not be stored, read, or deleted; details stay in the
 * server logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class ReceiptUploadsUnavailable extends HttpApiError.Problem<ReceiptUploadsUnavailable>()(
  "ReceiptUploadsUnavailable",
  {
    type: "goho:problem:receipt-uploads-unavailable",
    status: 500,
    title: "Receipt uploads unavailable",
  },
  {},
  { description: "The server could not get to the receipt uploads; take another shot." },
) {}
