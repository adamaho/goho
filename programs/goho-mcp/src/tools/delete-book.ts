import { BookId } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the delete book MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("delete_book", {
  description:
    "Permanently delete one saved Goho book by book ID, including its cover scans and images. Its category stays. Only call this when the user clearly asks to delete that book.",
  parameters: Schema.Struct({ book_id: BookId }),
  success: Schema.Struct({ deleted_book_id: BookId }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a delete book request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/DeleteBook.handle")(function* ({
  book_id,
}: {
  readonly book_id: BookId;
}) {
  const client = yield* GohoServerClient.Service;
  yield* client.books
    .delete({ params: { bookId: book_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "BookNotFound"
          ? `Book ${book_id} was not found.`
          : "Could not delete book. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    );
  return { deleted_book_id: book_id };
});
