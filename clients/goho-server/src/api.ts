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
    "Creates receipts in PostgreSQL and processes Google Drive receipt images into Google Sheets. The server listens on loopback without authentication.",
  )
  .add(
    HttpApiGroup.make("health")
      .annotate(OpenApi.Description, "Server liveness.")
      .add(
        HttpApiEndpoint.get("check", "/health", {
          success: Schema.Struct({
            status: Schema.Literal("ok").annotate({
              description: "Liveness status returned when the HTTP handler responds.",
            }),
          }).annotate({
            identifier: "HealthResponse",
            description:
              "Liveness response from the HTTP server. Database and provider readiness are not checked.",
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
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The required `idempotency-key` header or JSON payload is invalid. The response body is empty.",
            }),
            HttpApiError.Conflict.annotate({
              description:
                "The idempotency key already identifies different normalized receipt data. Returns JSON with only `_tag: Conflict`.",
            }),
            HttpApiError.InternalServerError.annotate({
              description:
                "Repository validation or persistence failed. Returns JSON with only `_tag: InternalServerError`; diagnostic causes stay in server logs.",
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
            "Creates a receipt and its ordered items in one database transaction and returns HTTP 200. Trims store, category, and item names and normalizes decimal strings before storage and idempotency comparison. Reusing the same key and normalized data returns the stored receipt; changing data or item order returns HTTP 409. The operation does not call Google Drive, Google Sheets, or OpenAI.",
          ),
      )
      .add(
        HttpApiEndpoint.post("process", "/receipts/process", {
          payload: ProcessRequest,
          success: Schema.Array(ReceiptProcessingResult).annotate({
            description:
              "One outcome per file in the batch’s Drive listing order, returned after the batch finishes. An empty todo folder returns an empty array. Individual `Failed` and `Stranded` outcomes still return HTTP 200.",
          }),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The JSON payload is invalid. All three fields are required. The response body is empty.",
            }),
            HttpApiError.Conflict.annotate({
              description:
                "Another batch is running in this server process, even for a different root or spreadsheet. Returns JSON with only `_tag: Conflict`.",
            }),
            HttpApiError.InternalServerError.annotate({
              description:
                "Batch setup or execution failed. Some files or rows can already have changed. Returns JSON with only `_tag: InternalServerError`; inspect server logs and workflow state before retrying.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Process a receipt batch")
          .annotate(
            OpenApi.Description,
            "Processes the files listed in the workflow root’s `todo` folder and waits for their outcomes. Claims files into `processing`, extracts JPEG, PNG, or WebP images, attempts database persistence, appends item rows to `RAW`, and moves completed files to `processed`. A file ID already present in the spreadsheet snapshot skips extraction, database persistence, and appending. Expected database save failures are logged and do not prevent Sheets processing. Drive moves, Sheets appends, and database writes do not share a transaction. Accepted work continues after client disconnect. The batch lock is local to this server process; run only one server against a workflow. Inspect Drive, Sheets, and logs before retrying after a lost response or failure.",
          ),
      ),
  );
