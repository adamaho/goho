import { BookUpload, BookUploadId } from "@goho/goho-server-client/book-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the get book upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_book_upload", {
  description:
    "Get one Goho book cover upload by upload ID with its latest status. A succeeded upload has the bookId to pass to get_book; a failed one has a failureCode explaining why.",
  parameters: Schema.Struct({ upload_id: BookUploadId }),
  success: Schema.Struct({ upload: BookUpload }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a get book upload request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/GetBookUpload.handle")(function* ({
  upload_id,
}: {
  readonly upload_id: BookUploadId;
}) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.bookUploads
    .get({ params: { uploadId: upload_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "BookUploadNotFound"
          ? new ToolFailure({ message: `Book upload ${upload_id} was not found.` })
          : apiFailure("get book upload", cause),
      ),
    );
  return { upload: response.data };
});
