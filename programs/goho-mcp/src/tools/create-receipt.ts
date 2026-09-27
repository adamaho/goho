import { CreateReceiptRequest, IdempotencyKey, Receipt } from "@goho/goho-server-client/receipts";
import { Crypto, Effect, Schema } from "effect";
import { Tool } from "effect/unstable/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the create receipt MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("create_receipt", {
  description:
    "Create a saved Goho receipt from supplied details. Use fictional receipt details only when the user asks for an example. Goho MCP generates the idempotency key for this call.",
  parameters: CreateReceiptRequest,
  success: Schema.Struct({ receipt: Receipt }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service, Crypto.Crypto],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a create receipt request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = (payload: CreateReceiptRequest) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const client = yield* GohoServerClient.Service;
    const idempotencyKey = IdempotencyKey.make(yield* crypto.randomUUIDv4);
    const response = yield* client.receipts.create({
      headers: { "idempotency-key": idempotencyKey },
      payload,
    });
    return { receipt: response.data };
  }).pipe(
    Effect.mapError(
      () =>
        "Could not create receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
    ),
  );
