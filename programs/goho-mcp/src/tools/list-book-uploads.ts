import { BookUpload } from "@goho/goho-server-client/book-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the list book uploads MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("list_book_uploads", {
  description:
    "List every Goho book cover upload, newest first, with its image file name, content type, and current status: queued, processing, succeeded with a bookId, or failed with a failureCode. Images are uploaded elsewhere, such as the Goho app.",
  success: Schema.Struct({ uploads: Schema.Array(BookUpload) }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a list book uploads request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/ListBookUploads.handle")(function* () {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.bookUploads
    .list()
    .pipe(Effect.mapError((cause) => apiFailure("list book uploads", cause)));
  return { uploads: response.data };
});
