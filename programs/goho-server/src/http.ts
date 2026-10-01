import { api } from "@goho/goho-api/api";
import { withData } from "@goho/goho-api/response";
import { Effect, FileSystem, Layer, Schema } from "effect";
import { HttpApiBuilder, HttpApiError, HttpApiSchema, HttpApiSwagger } from "effect/http-api";

import * as ReceiptUploads from "./receipt-uploads/service.ts";
import * as Receipts from "./receipts/service.ts";

const ReceiptUploadsLive = HttpApiBuilder.group(api, "receiptUploads", (handlers) =>
  Effect.gen(function* () {
    const uploads = yield* ReceiptUploads.Service;
    const fileSystem = yield* FileSystem.FileSystem;
    return handlers
      .handle("delete", ({ params }) => uploads.delete(params.uploadId))
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const bytes = yield* fileSystem
            .readFile(payload.file.path)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logError("Temporary receipt upload could not be read", cause).pipe(
                  Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
                ),
              ),
            );
          const input = yield* Schema.decodeUnknownEffect(ReceiptUploads.UploadInput)({
            name: payload.file.name,
            contentType: payload.file.contentType,
            bytes,
          }).pipe(Effect.mapError(() => new HttpApiError.BadRequest()));
          return yield* uploads.create(input).pipe(Effect.map(withData));
        }),
      )
      .handle("get", ({ params }) => uploads.get(params.uploadId).pipe(Effect.map(withData)))
      .handle("list", () => uploads.list.pipe(Effect.map(withData)));
  }),
);

const ReceiptsLive = HttpApiBuilder.group(api, "receipts", (handlers) =>
  Effect.gen(function* () {
    const receipts = yield* Receipts.Service;
    const uploads = yield* ReceiptUploads.Service;
    return handlers
      .handle("list", () => receipts.list.pipe(Effect.map(withData)))
      .handle("delete", ({ params }) => receipts.delete(params.receiptId))
      .handle("get", ({ params }) => receipts.get(params.receiptId).pipe(Effect.map(withData)))
      .handle("getImage", ({ params }) =>
        uploads.getImage(params.receiptId).pipe(
          Effect.map(({ bytes, contentType }) =>
            HttpApiSchema.withHeaders({
              body: bytes,
              headers: { "content-type": contentType, "cache-control": "private, no-store" },
            }),
          ),
        ),
      )
      .handle("create", ({ payload }) => receipts.create(payload).pipe(Effect.map(withData)));
  }),
);

const HealthLive = HttpApiBuilder.group(api, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed(withData({ status: "ok" as const }))),
);

/**
 * Provides the API routes, generated OpenAPI document, and Swagger UI.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.layer(api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide([ReceiptUploadsLive, ReceiptsLive, HealthLive]),
  Layer.merge(HttpApiSwagger.layer(api, { path: "/docs" })),
);
