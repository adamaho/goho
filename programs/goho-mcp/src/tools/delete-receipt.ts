import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the delete receipt MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("delete_receipt", {
  description:
    "Permanently delete one saved Goho receipt by receipt ID, including its items and scanned image. Only call this when the user clearly asks to delete that receipt.",
  parameters: Schema.Struct({ receipt_id: ReceiptId }),
  success: Schema.Struct({ deleted_receipt_id: ReceiptId }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a delete receipt request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/DeleteReceipt.handle")(function* ({
  receipt_id,
}: {
  readonly receipt_id: ReceiptId;
}) {
  const client = yield* GohoServerClient.Service;
  yield* client.receipts
    .delete({ params: { receiptId: receipt_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "NotFound"
          ? `Receipt ${receipt_id} was not found.`
          : "Could not delete receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    );
  return { deleted_receipt_id: receipt_id };
});
