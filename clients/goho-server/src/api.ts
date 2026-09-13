import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";

import {
  CreateReceiptRequest,
  IdempotencyKey,
  ProcessRequest,
  Receipt,
  ReceiptProcessingResult,
} from "./receipts.ts";

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
    "Local API for creating receipts and processing Google Drive receipt batches. No authentication is required.",
  )
  .add(
    HttpApiGroup.make("health")
      .annotate(OpenApi.Description, "Server liveness.")
      .add(
        HttpApiEndpoint.get("check", "/health", {
          success: Schema.Struct({ status: Schema.Literal("ok") }).annotate({
            identifier: "HealthResponse",
            description:
              "The HTTP server is running. This does not check database or provider readiness.",
            examples: [{ status: "ok" }],
          }),
        })
          .annotate(OpenApi.Summary, "Check server liveness")
          .annotate(
            OpenApi.Description,
            "Returns HTTP 200 while the server can handle requests, without calling PostgreSQL, Google, or OpenAI.",
          ),
      ),
    HttpApiGroup.make("receipts")
      .annotate(OpenApi.Description, "Receipt creation and synchronous batch processing.")
      .add(
        HttpApiEndpoint.post("create", "/receipts", {
          headers: { "idempotency-key": IdempotencyKey },
          payload: CreateReceiptRequest,
          success: Receipt,
          error: [
            HttpApiError.BadRequestNoContent,
            HttpApiError.Conflict,
            HttpApiError.InternalServerError,
          ],
        })
          .annotate(OpenApi.Summary, "Create a receipt")
          .annotate(
            OpenApi.Description,
            "Creates a receipt and its ordered items atomically. Repeating the same idempotency key and normalized payload returns the existing receipt. Returns 400 for invalid input, 409 for a key reused with different data, or 500 when persistence fails.",
          ),
      )
      .add(
        HttpApiEndpoint.post("process", "/receipts/process", {
          payload: ProcessRequest,
          success: Schema.Array(ReceiptProcessingResult),
          error: [
            HttpApiError.BadRequestNoContent,
            HttpApiError.Conflict,
            HttpApiError.InternalServerError,
          ],
        })
          .annotate(OpenApi.Summary, "Process a receipt batch")
          .annotate(
            OpenApi.Description,
            "Processes the workflow root's todo files and returns one outcome per file when the batch finishes. An empty batch returns an empty array. Individual Failed or Stranded outcomes still return HTTP 200. Returns 400 for invalid input, 409 while another batch is running, or 500 if the batch cannot complete. Accepted work continues if the client disconnects.",
          ),
      ),
  );
