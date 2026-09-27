import { Receipt, ReceiptId } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { Tool } from "effect/unstable/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the get receipt MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_receipt", {
  description: "Get one saved Goho receipt, including its items, by receipt ID.",
  parameters: Schema.Struct({ receipt_id: ReceiptId }),
  success: Schema.Struct({ receipt: Receipt }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a get receipt request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = ({ receipt_id }: { readonly receipt_id: ReceiptId }) =>
  Effect.gen(function* () {
    const client = yield* GohoServerClient.Service;
    const response = yield* client.receipts.get({ params: { receiptId: receipt_id } });
    return { receipt: response.data };
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "NotFound"
        ? `Receipt ${receipt_id} was not found.`
        : "Could not get receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
    ),
  );
