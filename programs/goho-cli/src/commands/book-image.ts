import { BookId } from "@goho/goho-server-client/books";
import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";
import { saveImageFile } from "#src/utils/save-image-file.ts";

/**
 * Saves one book's stored cover image to a file and describes the saved file.
 *
 * @category commands
 * @since 0.1.0
 */
export const imageCommand = Command.make("image", {
  bookId: Argument.String("book-id").pipe(
    Argument.withSchema(BookId),
    Argument.withDescription("Positive integer ID of the persisted book."),
  ),
  output: Flag.String("output").pipe(
    Flag.withDescription("File to save to. Defaults to book-<id> with the image's extension."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Save one book's stored cover image to a file."),
  Command.withHandler(({ bookId, output }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.books.getImage({ params: { bookId } }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                cause._tag === "BookImageNotFound"
                  ? `Book ${bookId} was not found or has no cover image.`
                  : "Book cover could not be retrieved. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      const saved = yield* saveImageFile({
        label: "Book cover",
        defaultName: `book-${bookId}`,
        bytes: response.body,
        contentType: response.headers["content-type"],
        output,
      });
      yield* Console.log(JSON.stringify(saved, null, 2));
    }),
  ),
);
