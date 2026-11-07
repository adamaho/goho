import { BookId } from "@goho/goho-server-client/books";
import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import * as GohoServer from "#src/goho-server.ts";
import { DeleteResult } from "#src/response.ts";

import { createCommand } from "./book-create.ts";
import { imageCommand } from "./book-image.ts";
import { patchCommand } from "./book-patch.ts";
import { searchCommand } from "./book-search.ts";
import { uploadsCommand } from "./book-uploads.ts";

const listCommand = Command.make("list").pipe(
  Command.withDescription("List all persisted books."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.books.list({ query: {} });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
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
    }),
  ),
  Command.provide(GohoServer.layer),
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
      const result = yield* DeleteResult.makeEffect({
        deleted: true,
        resource: "book",
        id: bookId,
      });
      yield* Console.log(JSON.stringify(result, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Command group for book cover uploads and downloads, retrieval, creation, corrections, and deletion.
 *
 * @category commands
 * @since 0.1.0
 */
export const booksCommand = Command.make("books").pipe(
  Command.withDescription("Manage books"),
  Command.withSubcommands([
    listCommand,
    searchCommand,
    viewCommand,
    imageCommand,
    createCommand,
    patchCommand,
    deleteCommand,
    uploadsCommand,
  ]),
);
