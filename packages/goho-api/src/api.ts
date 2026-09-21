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
import {
  CreateReceiptRequest,
  IdempotencyKey,
  ProcessRequest,
  Receipt,
  ReceiptId,
  ReceiptProcessingResult,
} from "./receipts.ts";
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
    "Runs the receipt playbook: upload and track images, manage finished receipts, and skate legacy Drive batches into Sheets. No authentication required, bud.",
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
      .annotate(OpenApi.Description, "Receipt retrieval, creation, and batch-processing plays.")
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
        HttpApiEndpoint.post("create", "/receipts", {
          headers: { "idempotency-key": IdempotencyKey },
          payload: CreateReceiptRequest,
          success: DataResponse(Receipt),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The `idempotency-key` header or payload is a bad pass; the response body stays empty.",
            }),
            HttpApiError.Conflict.annotate({
              description:
                "That idempotency key is already skating with different normalized receipt data or item order.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "Receipt validation or persistence missed the net.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Create a receipt")
          // Swagger displays parameter descriptions separately from referenced schema metadata.
          .annotate(OpenApi.Transform, (operation) => ({
            ...operation,
            parameters: operation.parameters.map((parameter: OpenApi.OpenAPISpecParameter) =>
              parameter.in === "header" && parameter.name === "idempotency-key"
                ? {
                    ...parameter,
                    description: Schema.resolveAnnotations(IdempotencyKey)?.description,
                  }
                : parameter,
            ),
          }))
          .annotate(
            OpenApi.Description,
            "Creates the receipt and items in one clean play. Reuse the key with the same normalized data and the saved receipt comes back.",
          ),
      )
      .add(
        HttpApiEndpoint.post("process", "/receipts/process", {
          payload: ProcessRequest,
          success: DataResponse(
            Schema.Array(ReceiptProcessingResult).annotate({
              description:
                "One final whistle per file in Drive listing order; empty when no files are found. `Failed` and `Stranded` still return HTTP 200.",
            }),
          ),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The payload is a bad pass; the response body stays empty.",
            }),
            HttpApiError.Conflict.annotate({
              description:
                "Another batch is already on the ice for this server, no matter the root or spreadsheet.",
            }),
            HttpApiError.InternalServerError.annotate({
              description:
                "The batch went sideways and may have left partial changes. Check Drive, Sheets, and server logs before taking another shot.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Process a receipt batch")
          .annotate(
            OpenApi.Description,
            "Skates `todo` images into `RAW` rows and waits for the final whistle. Accepted work keeps moving after a client disconnect. Run one server per workflow and check partial results before replaying a lost response.",
          ),
      ),
  );
