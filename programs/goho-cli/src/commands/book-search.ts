import { Console, Effect, Schema } from "effect";
import { Argument, Command } from "effect/cli";

import { CommandError, getRequestErrorCode } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

/**
 * Finds saved books by title or author and prints the matching array.
 *
 * @category commands
 * @since 0.1.0
 */
export const searchCommand = Command.make("search", {
  text: Argument.String("text").pipe(
    Argument.withSchema(Schema.Trim.check(Schema.isNonEmpty())),
    Argument.withDescription("Nonblank text to find in a book's title or author."),
  ),
}).pipe(
  Command.withDescription("Find books by title or author, ignoring case and extra spaces."),
  Command.withHandler(({ text }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.books.list({ query: { search: text } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            code: getRequestErrorCode(cause),
            message: "Books could not be searched. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);
