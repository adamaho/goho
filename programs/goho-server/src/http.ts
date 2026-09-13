import { api } from "@goho/goho-server-client/api";
import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";

import * as Receipts from "./receipts/service.ts";

const ReceiptsLive = HttpApiBuilder.group(api, "receipts", (handlers) =>
  Effect.gen(function* () {
    const receipts = yield* Receipts.Service;
    return handlers
      .handle("create", ({ headers, payload }) =>
        receipts.create(headers["idempotency-key"], payload),
      )
      .handle("process", ({ payload }) => receipts.process(payload));
  }),
);

const HealthLive = HttpApiBuilder.group(api, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed({ status: "ok" as const })),
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
