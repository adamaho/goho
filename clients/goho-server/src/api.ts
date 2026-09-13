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
    "Creates receipts and processes Google Drive images into Google Sheets. No authentication is required.",
  )
  .add(
    HttpApiGroup.make("health")
      .annotate(OpenApi.Description, "Server liveness.")
      .add(
        HttpApiEndpoint.get("check", "/health", {
          success: Schema.Struct({
            status: Schema.Literal("ok").annotate({
              description: "Server status.",
            }),
          }).annotate({
            identifier: "HealthResponse",
            description: "Server liveness.",
            examples: [{ status: "ok" }],
          }),
        })
          .annotate(OpenApi.Summary, "Check server liveness")
          .annotate(OpenApi.Description, "Does not check database or provider readiness."),
      ),
    HttpApiGroup.make("receipts")
      .annotate(OpenApi.Description, "Receipt creation and synchronous batch processing.")
      .add(
        HttpApiEndpoint.post("create", "/receipts", {
          headers: { "idempotency-key": IdempotencyKey },
          payload: CreateReceiptRequest,
          success: Receipt,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The `idempotency-key` header or payload is invalid; the response body is empty.",
            }),
            HttpApiError.Conflict.annotate({
              description:
                "The idempotency key identifies different normalized receipt data or item order.",
            }),
            HttpApiError.InternalServerError.annotate({
              description: "Receipt validation or persistence failed.",
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
            "Creates the receipt and items atomically. Reusing the key with the same normalized data returns the stored receipt.",
          ),
      )
      .add(
        HttpApiEndpoint.post("process", "/receipts/process", {
          payload: ProcessRequest,
          success: Schema.Array(ReceiptProcessingResult).annotate({
            description:
              "One outcome per file in Drive listing order; empty when no files are found. `Failed` and `Stranded` outcomes still return HTTP 200.",
          }),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The payload is invalid; the response body is empty.",
            }),
            HttpApiError.Conflict.annotate({
              description:
                "Another batch is running on this server, regardless of root or spreadsheet.",
            }),
            HttpApiError.InternalServerError.annotate({
              description:
                "The batch failed; partial changes may remain. Inspect Drive, Sheets, and server logs before retrying.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Process a receipt batch")
          .annotate(
            OpenApi.Description,
            "Processes `todo` images into `RAW` rows and waits for completion. Accepted work continues after client disconnect. Run only one server per workflow; inspect partial results before retrying a lost response.",
          ),
      ),
  );
