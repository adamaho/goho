import { ReceiptUploadId } from "@goho/goho-server-client/receipt-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the delete receipt upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("delete_receipt_upload", {
  description:
    "Permanently delete one failed Goho receipt upload and its stored image by upload ID. Queued, processing, and succeeded uploads can't be deleted, and this never deletes a saved receipt; use delete_receipt for that. Only call this when the user clearly asks to delete that upload.",
  parameters: Schema.Struct({ upload_id: ReceiptUploadId }),
  success: Schema.Struct({ deleted_upload_id: ReceiptUploadId }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a delete receipt upload request with the Goho server client. The API alone decides whether
 * the upload has failed and can be deleted, so there is no status lookup first.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/DeleteReceiptUpload.handle")(function* ({
  upload_id,
}: {
  readonly upload_id: ReceiptUploadId;
}) {
  const client = yield* GohoServerClient.Service;
  yield* client.receiptUploads.delete({ params: { uploadId: upload_id } }).pipe(
    Effect.mapError((cause) => {
      switch (cause._tag) {
        case "ReceiptUploadNotFound":
          return new ToolFailure({ message: `Receipt upload ${upload_id} was not found.` });
        case "ReceiptUploadConflict":
          return new ToolFailure({
            message: "Only failed receipt uploads can be deleted. Nothing changed.",
          });
        default:
          return apiFailure("delete receipt upload", cause);
      }
    }),
  );
  return { deleted_upload_id: upload_id };
});
