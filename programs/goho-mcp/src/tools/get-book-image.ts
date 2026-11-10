import { BookId } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";
import * as ImageTool from "./image.ts";

const action = "get book image";

/**
 * Registers the get book image MCP tool with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const register = Effect.gen(function* () {
  const client = yield* GohoServerClient.Service;
  yield* ImageTool.register({
    name: "get_book_image",
    description:
      "Get the cover image on file for one saved Goho book by book ID, returned as an image. It is the book's first successful cover scan; books entered by hand have none until a scan of them succeeds.",
    action,
    parameters: Schema.Struct({ book_id: BookId }),
    get: ({ book_id }) =>
      client.books.getImage({ params: { bookId: book_id } }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "BookImageNotFound"
            ? new ToolFailure({
                message: `Book ${book_id} has no cover image, or it was not found.`,
              })
            : apiFailure(action, cause),
        ),
      ),
  });
});
