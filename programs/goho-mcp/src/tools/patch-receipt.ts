import { PatchReceiptRequest, Receipt, ReceiptId } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Exposes receipt corrections with strict API-compatible validation.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("patch_receipt", {
  description:
    "Correct a saved Goho receipt's store name or receipt date. Supply at least one field in changes; omitted fields stay unchanged. Amounts, currency, and items cannot be changed with this tool; use patch_receipt_item for item names and categories.",
  parameters: Schema.Struct({ receipt_id: ReceiptId, changes: PatchReceiptRequest }),
  success: Schema.Struct({ receipt: Receipt }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Strict, true)
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Applies receipt corrections and returns the complete receipt.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/PatchReceipt.handle")(function* ({
  receipt_id,
  changes,
}: Tool.Parameters<typeof tool>) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.receipts
    .patch({ params: { receiptId: receipt_id }, payload: changes })
    .pipe(
      Effect.mapError((cause) => {
        if (cause._tag === "NotFound") return `Receipt ${receipt_id} was not found.`;
        if (cause._tag === "BadRequest")
          return "The receipt correction was rejected. Check the supplied changes.";
        return "Could not patch receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.";
      }),
    );
  return { receipt: response.data };
});
