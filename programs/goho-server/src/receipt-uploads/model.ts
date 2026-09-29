import {
  ReceiptUploadContentType,
  ReceiptUploadFailureCode,
  ReceiptUploadId,
  ReceiptUploadStatus,
} from "@goho/goho-api/receipt-uploads";
import { ReceiptId } from "@goho/goho-api/receipts";
import { Schema } from "effect";

import { FileId } from "#src/file-storage.ts";
import type { ParsedReceipt } from "#src/receipts/model.ts";
import { NonEmptyText } from "#src/schema.ts";

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

/**
 * Extraction result recorded when an upload succeeds.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptExtraction {
  readonly version: number;
  readonly payload: ParsedReceipt;
}
