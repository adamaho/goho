import { CreateReceiptRequest, Receipt } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the create receipt MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("create_receipt", {
  description:
    "Create a saved Goho receipt from supplied details. Use fictional receipt details only when the user asks for an example.",
  parameters: CreateReceiptRequest,
  success: Schema.Struct({ receipt: Receipt }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const createFailureMessage =
  "Could not create receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.";

/**
 * Handles a create receipt request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/CreateReceipt.handle")(function* (
  payload: CreateReceiptRequest,
) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.receipts
    .create({ payload })
    .pipe(Effect.mapError(() => createFailureMessage));
  return { receipt: response.data };
});
