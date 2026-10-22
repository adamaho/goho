import { Book, CreateBookRequest } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the create book MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("create_book", {
  description:
    "Create a saved Goho book from a title, author, category, and optional reading level. If a saved book already has that title and author, ignoring case and extra spaces, that book is returned unchanged. Use fictional book details only when the user asks for an example.",
  parameters: CreateBookRequest,
  success: Schema.Struct({ book: Book }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Strict, true)
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const createFailureMessage =
  "Could not create book. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.";

/**
 * Handles a create book request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/CreateBook.handle")(function* (payload: CreateBookRequest) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.books
    .create({ payload })
    .pipe(Effect.mapError(() => createFailureMessage));
  return { book: response.data };
});
