import { BookId } from "@goho/goho-server-client/books";
import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

import { patchCommand } from "./book-patches.ts";
import { statusCommand, uploadCommand } from "./book-uploads.ts";

const listCommand = Command.make("list").pipe(
  Command.withDescription("List all persisted books."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.books.list({ query: {} });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message: "Books could not be listed. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

const viewCommand = Command.make("view", {
  bookId: Argument.String("book-id").pipe(
    Argument.withSchema(BookId),
    Argument.withDescription("Positive integer ID of the persisted book to view."),
  ),
}).pipe(
  Command.withDescription("View one persisted book."),
  Command.withHandler(({ bookId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.books.get({ params: { bookId } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "BookNotFound"
                ? `Book ${bookId} was not found.`
                : "Book could not be retrieved. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

const deleteCommand = Command.make("delete", {
  bookId: Argument.String("book-id").pipe(
    Argument.withSchema(BookId),
    Argument.withDescription("Positive integer ID of the persisted book to delete."),
  ),
}).pipe(
  Command.withDescription("Permanently delete one persisted book and its cover scans."),
  Command.withHandler(({ bookId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      yield* client.books.delete({ params: { bookId } });
      yield* Console.log(`Deleted book ${bookId}.`);
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "BookNotFound"
                ? `Book ${bookId} was not found.`
                : "Book could not be deleted. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

/**
 * Command group for book cover uploads, retrieval, corrections, and deletion.
 *
 * @category commands
 * @since 0.1.0
 */
export const booksCommand = Command.make("books").pipe(
  Command.withDescription("Manage books"),
  Command.withSubcommands([
    listCommand,
    viewCommand,
    patchCommand,
    deleteCommand,
    uploadCommand,
    statusCommand,
  ]),
);
