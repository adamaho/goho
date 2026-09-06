import { api, Authorization } from "@goho/goho-server-client/api";
import { Effect, Layer, Redacted } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";

import * as Receipts from "./receipts/service.ts";

/**
 * Provides bearer authentication for the shared API.
 *
 * @category models
 * @since 0.1.0
 */
export function layerAuthorization(token: Redacted.Redacted<string>) {
  return Layer.succeed(Authorization, {
    bearer: (httpEffect, { credential }) =>
      Redacted.value(credential) === Redacted.value(token)
        ? httpEffect
        : Effect.fail(new HttpApiError.Unauthorized()),
  });
}

const ReceiptsLive = HttpApiBuilder.group(api, "receipts", (handlers) =>
  handlers.handle("process", ({ payload }) =>
    Effect.flatMap(Receipts.Service, (receipts) => receipts.process(payload)),
  ),
);

/**
 * Provides the receipt HTTP routes.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.layer(api).pipe(Layer.provide(ReceiptsLive));
