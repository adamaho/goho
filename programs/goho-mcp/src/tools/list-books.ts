import { Book } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the list books MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("list_books", {
  description:
    "List saved Goho books, newest first. Supply search to find books whose title or author contains that text, ignoring case.",
  parameters: Schema.Struct({ search: Schema.optionalKey(Schema.String) }),
  success: Schema.Struct({ books: Schema.Array(Book) }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a list books request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/ListBooks.handle")(function* (
  query: Tool.Parameters<typeof tool>,
) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.books
    .list({ query })
    .pipe(
      Effect.mapError(
        () =>
          "Could not list books. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    );
  return { books: response.data };
});
