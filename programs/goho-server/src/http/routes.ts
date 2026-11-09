import { api } from "@goho/goho-api/api";
import { BookUploadsUnavailable } from "@goho/goho-api/book-uploads";
import { ReceiptUploadsUnavailable } from "@goho/goho-api/receipt-uploads";
import { withData } from "@goho/goho-api/response";
import { Effect, FileSystem, Layer, Schema } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/http";
import {
  HttpApiBuilder,
  HttpApiError,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSwagger,
} from "effect/http-api";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";
import * as RecipeUploads from "#src/recipe-uploads/service.ts";
import * as Recipes from "#src/recipes/service.ts";

import * as ProblemDetails from "./problem-details.ts";

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
                  Effect.andThen(Effect.fail(new ReceiptUploadsUnavailable())),
                ),
              ),
            );
          const input = yield* Schema.decodeUnknownEffect(ReceiptUploads.UploadInput)({
            name: payload.file.name,
            contentType: payload.file.contentType,
            bytes,
          }).pipe(
            Effect.mapError(
              () =>
                new HttpApiError.BadRequestProblem({
                  detail: "Send one JPEG, PNG, or WebP image with a nonblank file name.",
                }),
            ),
          );
          return yield* uploads.create(input).pipe(Effect.map(withData));
        }),
      )
      .handle("get", ({ params }) => uploads.get(params.uploadId).pipe(Effect.map(withData)))
      .handle("list", () => uploads.list.pipe(Effect.map(withData)));
  }),
);

const BookUploadsLive = HttpApiBuilder.group(api, "bookUploads", (handlers) =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const fileSystem = yield* FileSystem.FileSystem;
    return handlers
      .handle("delete", ({ params }) => uploads.delete(params.uploadId))
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const bytes = yield* fileSystem
            .readFile(payload.file.path)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logError("Temporary book upload could not be read", cause).pipe(
                  Effect.andThen(Effect.fail(new BookUploadsUnavailable())),
                ),
              ),
            );
          const input = yield* Schema.decodeUnknownEffect(BookUploads.UploadInput)({
            name: payload.file.name,
            contentType: payload.file.contentType,
            bytes,
          }).pipe(
            Effect.mapError(
              () =>
                new HttpApiError.BadRequestProblem({
                  detail: "Send one JPEG, PNG, or WebP image with a nonblank file name.",
                }),
            ),
          );
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
      .handle("create", ({ payload }) => receipts.create(payload).pipe(Effect.map(withData)))
      .handle("patch", ({ params, payload }) =>
        receipts.patch(params.receiptId, payload).pipe(Effect.map(withData)),
      )
      .handle("patchItem", ({ params, payload }) =>
        receipts.patchItem(params.receiptId, params.itemId, payload).pipe(Effect.map(withData)),
      );
  }),
);

const BooksLive = HttpApiBuilder.group(api, "books", (handlers) =>
  Effect.gen(function* () {
    const books = yield* Books.Service;
    return handlers
      .handle("list", ({ query }) => books.list(query.search).pipe(Effect.map(withData)))
      .handle("get", ({ params }) => books.get(params.bookId).pipe(Effect.map(withData)))
      .handle("create", ({ payload }) => books.create(payload).pipe(Effect.map(withData)))
      .handle("patch", ({ params, payload }) =>
        books.patch(params.bookId, payload).pipe(Effect.map(withData)),
      )
      .handle("delete", ({ params }) => books.delete(params.bookId))
      .handle("getImage", ({ params }) =>
        books.getImage(params.bookId).pipe(
          Effect.map(({ bytes, contentType }) =>
            HttpApiSchema.withHeaders({
              body: bytes,
              headers: { "content-type": contentType, "cache-control": "private, no-store" },
            }),
          ),
        ),
      );
  }),
);

const RecipesLive = HttpApiBuilder.group(api, "recipes", (handlers) =>
  Effect.gen(function* () {
    const recipes = yield* Recipes.Service;
    return handlers
      .handle("list", () => recipes.list.pipe(Effect.map(withData)))
      .handle("get", ({ params }) => recipes.get(params.recipeId).pipe(Effect.map(withData)))
      .handle("create", ({ payload }) => recipes.create(payload).pipe(Effect.map(withData)))
      .handle("delete", ({ params }) => recipes.delete(params.recipeId))
      .handle("getImage", ({ params }) =>
        recipes.getImage(params.recipeId).pipe(
          Effect.map(({ bytes, contentType }) =>
            HttpApiSchema.withHeaders({
              body: bytes,
              headers: { "content-type": contentType, "cache-control": "private, no-store" },
            }),
          ),
        ),
      );
  }),
);

const RecipeUploadsLive = HttpApiBuilder.group(api, "recipeUploads", (handlers) =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploads.Service;
    return handlers
      .handle("create", ({ payload }) => uploads.create(payload.source).pipe(Effect.map(withData)))
      .handle("list", () => uploads.list.pipe(Effect.map(withData)))
      .handle("get", ({ params }) => uploads.get(params.uploadId).pipe(Effect.map(withData)))
      .handle("delete", ({ params }) => uploads.delete(params.uploadId));
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
  Layer.provide([
    ReceiptUploadsLive,
    ReceiptsLive,
    BooksLive,
    BookUploadsLive,
    RecipesLive,
    RecipeUploadsLive,
    HealthLive,
  ]),
  Layer.provide(HttpApiMiddleware.layerProblemDetails()),
  Layer.merge(HttpApiSwagger.layer(api, { path: "/docs" })),
  Layer.merge(
    HttpRouter.middleware(HttpMiddleware.cors({ allowedOrigins: () => false }), { global: true }),
  ),
  Layer.merge(ProblemDetails.layer),
);
