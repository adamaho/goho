import { Book, BookId, PatchBookRequest } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Exposes book corrections with strict API-compatible validation.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("patch_book", {
  description:
    "Correct a saved Goho book's title, author, category, or reading level. Supply at least one field in changes; omitted fields stay unchanged. Values must be nonempty text; author and readingLevel cannot be cleared with null. Categories are saved in lowercase, and an unfamiliar name adds a new category. Books are never merged, so a title and author matching another saved book is rejected.",
  parameters: Schema.Struct({ book_id: BookId, changes: PatchBookRequest }),
  success: Schema.Struct({ book: Book }),
  failure: ToolFailure,
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
        if (cause._tag === "BookNotFound")
          return new ToolFailure({ message: `Book ${book_id} was not found.` });
        if (cause._tag === "BookConflict")
          return new ToolFailure({
            message: "Another saved book already has that title and author. Nothing changed.",
          });
        if (cause._tag === "BadRequestProblem")
          return new ToolFailure({
            message: "The book correction was rejected. Check the supplied changes.",
          });
        return apiFailure("patch book", cause);
      }),
    );
  return { book: response.data };
});
