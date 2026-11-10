import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";
import * as ImageTool from "./image.ts";

const action = "get receipt image";

/**
 * Registers the get receipt image MCP tool with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const register = Effect.gen(function* () {
  const client = yield* GohoServerClient.Service;
  yield* ImageTool.register({
    name: "get_receipt_image",
    description:
      "Get the scanned image of one saved Goho receipt by receipt ID, returned as an image. Receipts entered by hand may have none.",
    action,
    parameters: Schema.Struct({ receipt_id: ReceiptId }),
    get: ({ receipt_id }) =>
      client.receipts.getImage({ params: { receiptId: receipt_id } }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "ReceiptImageNotFound"
            ? new ToolFailure({
                message: `Receipt ${receipt_id} has no scanned image, or it was not found.`,
              })
            : apiFailure(action, cause),
        ),
      ),
  });
});
