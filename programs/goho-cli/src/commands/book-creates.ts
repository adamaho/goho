import { CreateBookRequest } from "@goho/goho-server-client/books";
import { Console, Effect, Option, Schema, type Types } from "effect";
import { Command, Flag } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

/**
 * Adds one book by hand and prints it. A book already saved with the same title
 * and author comes back unchanged, so the output may not match the other flags.
 *
 * @category commands
 * @since 0.1.0
 */
export const createCommand = Command.make("create", {
  title: Flag.String("title").pipe(Flag.withDescription("Book title.")),
  category: Flag.String("category").pipe(Flag.withDescription("Book category name.")),
  author: Flag.String("author").pipe(Flag.withDescription("Author, if known."), Flag.optional),
  readingLevel: Flag.String("reading-level").pipe(
    Flag.withDescription("Reading level, if known."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Add one book, or print the saved book with that title and author."),
  Command.withHandler(({ title, category, author, readingLevel }) =>
    Effect.gen(function* () {
      const fields: Types.Mutable<CreateBookRequest> = { title, category };
      if (Option.isSome(author)) fields.author = author.value;
      if (Option.isSome(readingLevel)) fields.readingLevel = readingLevel.value;
      const payload = yield* Schema.decodeEffect(CreateBookRequest)(fields).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                "Values for --title, --category, --author, and --reading-level must be nonblank.",
              cause,
            }),
        ),
      );
      const client = yield* GohoServer.Service;
      const response = yield* client.books.create({ payload }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                cause._tag === "BadRequest"
                  ? "The book was rejected. Check the supplied values."
                  : "Book could not be created. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
);
