import { BookUploadId } from "@goho/goho-server-client/book-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the delete book upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("delete_book_upload", {
  description:
    "Permanently delete one failed Goho book cover upload and its stored image by upload ID. Queued, processing, and succeeded uploads can't be deleted, and this never deletes a saved book; use delete_book for that. Only call this when the user clearly asks to delete that upload.",
  parameters: Schema.Struct({ upload_id: BookUploadId }),
  success: Schema.Struct({ deleted_upload_id: BookUploadId }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a delete book upload request with the Goho server client. The API alone decides whether
 * the upload has failed and can be deleted, so there is no status lookup first.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/DeleteBookUpload.handle")(function* ({
  upload_id,
}: {
  readonly upload_id: BookUploadId;
}) {
  const client = yield* GohoServerClient.Service;
  yield* client.bookUploads.delete({ params: { uploadId: upload_id } }).pipe(
    Effect.mapError((cause) => {
      switch (cause._tag) {
        case "BookUploadNotFound":
          return new ToolFailure({ message: `Book upload ${upload_id} was not found.` });
        case "BookUploadConflict":
          return new ToolFailure({
            message: "Only failed book uploads can be deleted. Nothing changed.",
          });
        default:
          return apiFailure("delete book upload", cause);
      }
    }),
  );
  return { deleted_upload_id: upload_id };
});
