import { ReceiptUpload } from "@goho/goho-server-client/receipt-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the list receipt uploads MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("list_receipt_uploads", {
  description:
    "List every Goho receipt upload, newest first, with its image file name, content type, and current status: queued, processing, succeeded with a receiptId, or failed with a failureCode. Images are uploaded elsewhere, such as the Goho app.",
  success: Schema.Struct({ uploads: Schema.Array(ReceiptUpload) }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a list receipt uploads request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/ListReceiptUploads.handle")(function* () {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.receiptUploads
    .list()
    .pipe(Effect.mapError((cause) => apiFailure("list receipt uploads", cause)));
  return { uploads: response.data };
});
