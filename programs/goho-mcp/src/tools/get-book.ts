import { Book, BookId } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the get book MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_book", {
  description: "Get one saved Goho book by book ID.",
  parameters: Schema.Struct({ book_id: BookId }),
  success: Schema.Struct({ book: Book }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a get book request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/GetBook.handle")(function* ({
  book_id,
}: {
  readonly book_id: BookId;
}) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.books
    .get({ params: { bookId: book_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "BookNotFound"
          ? new ToolFailure({ message: `Book ${book_id} was not found.` })
          : apiFailure("get book", cause),
      ),
    );
  return { book: response.data };
});
