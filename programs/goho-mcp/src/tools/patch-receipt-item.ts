import {
  PatchReceiptItemRequest,
  ReceiptId,
  ReceiptItem,
  ReceiptItemId,
} from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Exposes item name corrections with strict API-compatible validation.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("patch_receipt_item", {
  description:
    "Rename one item on a saved Goho receipt. Use receipt_id and the item's item_id from get_receipt or list_receipts, and supply the new name in changes. Returns the saved item; its amount and position stay unchanged.",
  parameters: Schema.Struct({
    receipt_id: ReceiptId,
    item_id: ReceiptItemId,
    changes: PatchReceiptItemRequest,
  }),
  success: Schema.Struct({ item: ReceiptItem }),
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
 * Applies item name corrections and returns the saved item.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/PatchReceiptItem.handle")(function* ({
  receipt_id,
  item_id,
  changes,
}: Tool.Parameters<typeof tool>) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.receipts
    .patchItem({ params: { receiptId: receipt_id, itemId: item_id }, payload: changes })
    .pipe(
      Effect.mapError((cause) => {
        if (cause._tag === "NotFound")
          return `Item ${item_id} was not found on receipt ${receipt_id}.`;
        if (cause._tag === "BadRequest")
          return "The item correction was rejected. Check the supplied changes.";
        return "Could not patch receipt item. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.";
      }),
    );
  return { item: response.data };
});
