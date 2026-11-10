import { ReceiptUpload, ReceiptUploadId } from "@goho/goho-server-client/receipt-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the get receipt upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_receipt_upload", {
  description:
    "Get one Goho receipt upload by upload ID with its latest status. A succeeded upload has the receiptId to pass to get_receipt; a failed one has a failureCode explaining why.",
  parameters: Schema.Struct({ upload_id: ReceiptUploadId }),
  success: Schema.Struct({ upload: ReceiptUpload }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a get receipt upload request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/GetReceiptUpload.handle")(function* ({
  upload_id,
}: {
  readonly upload_id: ReceiptUploadId;
}) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.receiptUploads
    .get({ params: { uploadId: upload_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "ReceiptUploadNotFound"
          ? new ToolFailure({ message: `Receipt upload ${upload_id} was not found.` })
          : apiFailure("get receipt upload", cause),
      ),
    );
  return { upload: response.data };
});
