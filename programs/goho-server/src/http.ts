import { api } from "@goho/goho-server-client/api";
import { withData } from "@goho/goho-server-client/response";
import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";

import * as Receipts from "./receipts/service.ts";

const ReceiptsLive = HttpApiBuilder.group(api, "receipts", (handlers) =>
  Effect.gen(function* () {
    const receipts = yield* Receipts.Service;
    return handlers
      .handle("list", () => receipts.list().pipe(Effect.map(withData)))
      .handle("create", ({ headers, payload }) =>
        receipts.create(headers["idempotency-key"], payload).pipe(Effect.map(withData)),
      )
      .handle("process", ({ payload }) => receipts.process(payload).pipe(Effect.map(withData)));
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
  Layer.provide([ReceiptsLive, HealthLive]),
  Layer.merge(HttpApiSwagger.layer(api, { path: "/docs" })),
);
