import { BookId, PatchBookRequest } from "@goho/goho-server-client/books";
import { Console, Effect, Option, Schema, type Types } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

/**
 * Corrects supplied book details and prints the saved book.
 *
 * @category commands
 * @since 0.1.0
 */
export const patchCommand = Command.make("patch", {
  bookId: Argument.String("book-id").pipe(
    Argument.withSchema(BookId),
    Argument.withDescription("Positive integer ID of the persisted book to patch."),
  ),
  title: Flag.String("title").pipe(Flag.withDescription("Corrected book title."), Flag.optional),
  author: Flag.String("author").pipe(Flag.withDescription("Corrected author."), Flag.optional),
  category: Flag.String("category").pipe(
    Flag.withDescription("Corrected book category name."),
    Flag.optional,
  ),
  readingLevel: Flag.String("reading-level").pipe(
    Flag.withDescription("Corrected reading level."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Correct book details; supply at least one field."),
  Command.withHandler(({ bookId, title, author, category, readingLevel }) =>
    Effect.gen(function* () {
      const changes: Types.Mutable<PatchBookRequest> = {};
      if (Option.isSome(title)) changes.title = title.value;
      if (Option.isSome(author)) changes.author = author.value;
      if (Option.isSome(category)) changes.category = category.value;
      if (Option.isSome(readingLevel)) changes.readingLevel = readingLevel.value;
      const payload = yield* Schema.decodeEffect(PatchBookRequest)(changes).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                "Supply at least one of --title, --author, --category, or --reading-level. Values must be nonblank.",
              cause,
            }),
        ),
      );
      const client = yield* GohoServer.Service;
      const response = yield* client.books.patch({ params: { bookId }, payload }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                cause._tag === "BookNotFound"
                  ? `Book ${bookId} was not found.`
                  : cause._tag === "BookConflict"
                    ? "Another book already has that title and author."
                    : cause._tag === "BadRequest"
                      ? "The book correction was rejected. Check the supplied changes."
                      : "Book could not be patched. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
);
