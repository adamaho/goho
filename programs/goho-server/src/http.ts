import { api } from "@goho/goho-server-client/api";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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

/**
 * Provides the receipt HTTP routes.
 *
 * @category models
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.layer(api).pipe(Layer.provide(ReceiptsLive));
