import { Book, BookId, PatchBookRequest } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Exposes book corrections with strict API-compatible validation.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("patch_book", {
  description:
    "Correct a saved Goho book's title, author, category, or reading level. Supply at least one field in changes; omitted fields stay unchanged and a null readingLevel clears it. Categories are saved in lowercase, and an unfamiliar name adds a new category. Books are never merged, so a title and author matching another saved book is rejected.",
  parameters: Schema.Struct({ book_id: BookId, changes: PatchBookRequest }),
  success: Schema.Struct({ book: Book }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Strict, true)
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Applies book corrections and returns the complete book.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/PatchBook.handle")(function* ({
  book_id,
  changes,
}: Tool.Parameters<typeof tool>) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.books
    .patch({ params: { bookId: book_id }, payload: changes })
    .pipe(
      Effect.mapError((cause) => {
        if (cause._tag === "BookNotFound") return `Book ${book_id} was not found.`;
        if (cause._tag === "BookConflict")
          return "Another saved book already has that title and author. Nothing changed.";
        if (cause._tag === "BadRequest")
          return "The book correction was rejected. Check the supplied changes.";
        return "Could not patch book. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.";
      }),
    );
  return { book: response.data };
});
