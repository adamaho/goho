import { Schema } from "effect";
import { Multipart } from "effect/unstable/http";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi";

import { ReceiptUpload, ReceiptUploadId } from "./receipt-uploads.ts";
import { CreateReceiptRequest, Receipt, ReceiptId } from "./receipts.ts";
import { DataResponse } from "./response.ts";

// Payload schemas

const ReceiptUploadPayload = Schema.Struct({ file: Multipart.SingleFileSchema }).pipe(
  HttpApiSchema.asMultipart({
    maxParts: 1,
    maxFileSize: "20 megabytes",
    maxTotalSize: "21 megabytes",
  }),
);

// API groups

/**
 * Goho server HTTP contract.
 *
 * @category models
 * @since 0.1.0
 */
export const api = HttpApi.make("goho-server")
  .annotate(OpenApi.Title, "Goho API")
  .annotate(OpenApi.Version, "0.0.0")
  .annotate(
    OpenApi.Description,
    "Runs the receipt playbook: upload and track images, and manage finished receipts. No authentication required, bud.",
  )
  .add(
    // Health
    HttpApiGroup.make("health")
      .annotate(OpenApi.Description, "A quick bench check for server liveness.")
      .add(
        HttpApiEndpoint.get("check", "/health", {
          success: DataResponse(
            Schema.Struct({
              status: Schema.Literal("ok").annotate({
                description: "The server's bench status.",
              }),
            }).annotate({
              identifier: "HealthData",
              description: "Whether the server is awake for the shift.",
              examples: [{ status: "ok" }],
            }),
          ),
        })
          .annotate(OpenApi.Summary, "Check server liveness")
          .annotate(
            OpenApi.Description,
            "Confirms the server is awake; it does not skate over to the database or providers.",
          ),
      ),
    // Receipt uploads
    HttpApiGroup.make("receiptUploads")
      .annotate(OpenApi.Description, "Single-file receipt uploads and their processing status.")
      .add(
        HttpApiEndpoint.post("create", "/receipt-uploads", {
          payload: ReceiptUploadPayload,
          success: DataResponse(ReceiptUpload).pipe(HttpApiSchema.status(202)),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload is missing a supported receipt image.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "The server could not store or queue the receipt image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Upload a receipt image")
          .annotate(
            OpenApi.Description,
            "Stores one receipt image and returns its queued status before processing starts.",
          ),
      )
      .add(
        HttpApiEndpoint.get("list", "/receipt-uploads", {
          success: DataResponse(Schema.Array(ReceiptUpload)),
          error: [
            HttpApiError.InternalServerError.annotate({
              description: "The server could not pull the uploads off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List receipt uploads")
          .annotate(
            OpenApi.Description,
            "Pulls every receipt upload off the bench, newest first, with its current status.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/receipt-uploads/:uploadId", {
          params: { uploadId: ReceiptUploadId },
          success: DataResponse(ReceiptUpload),
          error: [
            HttpApiError.NotFound.annotate({
              description: "No receipt upload is wearing that number, bud.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "The server could not retrieve this receipt upload.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get receipt upload status")
          .annotate(
            OpenApi.Description,
            "Returns the latest queue or processing status and the receipt ID after a clean finish.",
          ),
      ),
    // Receipts
    HttpApiGroup.make("receipts")
      .annotate(OpenApi.Description, "Receipt retrieval, creation, and deletion plays.")
      .add(
        HttpApiEndpoint.get("list", "/receipts", {
          success: DataResponse(
            Schema.Array(Receipt).annotate({
              description: "Complete receipts, newest off the bench first; empty when none exist.",
            }),
          ),
          error: [
            HttpApiError.InternalServerError.annotate({
              description: "The server could not pull the receipts off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List receipts")
          .annotate(
            OpenApi.Description,
            "Pulls every saved receipt off the bench, newest first, with its items in position order.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/receipts/:receiptId", {
          params: { receiptId: ReceiptId },
          success: DataResponse(Receipt),
          error: [
            HttpApiError.NotFound.annotate({
              description: "No receipt is wearing that number, bud.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "The server could not retrieve this receipt.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a receipt")
          .annotate(
            OpenApi.Description,
            "Brings back one saved receipt with its items lined up by position.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/receipts/:receiptId", {
          params: { receiptId: ReceiptId },
          success: HttpApiSchema.NoContent,
          error: [
            HttpApiError.NotFound.annotate({
              description: "No receipt is wearing that number, bud.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "The server could not delete this receipt and its stored image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a receipt")
          .annotate(
            OpenApi.Description,
            "Permanently removes the receipt, items, upload record, original image, and extraction data. Returns no body after a clean finish.",
          ),
      )
      .add(
        HttpApiEndpoint.get("getImage", "/receipts/:receiptId/image", {
          params: { receiptId: ReceiptId },
          success: HttpApiSchema.WithHeaders(
            Schema.Uint8Array.pipe(
              HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }),
            ),
            Schema.Struct({
              "content-type": Schema.String,
              "cache-control": Schema.String,
            }),
          ),
          error: [
            HttpApiError.NotFound.annotate({
              description: "No scanned image is linked to this receipt, bud.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "The server could not retrieve this receipt image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a receipt image")
          .annotate(
            OpenApi.Description,
            "Returns the scanned image for an uploaded receipt. Manually created receipts may not have one.",
          ),
      )
      .add(
        HttpApiEndpoint.post("create", "/receipts", {
          payload: CreateReceiptRequest,
          success: DataResponse(Receipt),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The payload is a bad pass; the response body stays empty.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "Receipt validation or persistence missed the net.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Create a receipt")
          .annotate(
            OpenApi.Description,
            "Creates the receipt and items in one clean play. Every call saves a new receipt.",
          ),
      ),
  );
