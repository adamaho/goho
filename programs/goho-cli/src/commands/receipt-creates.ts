import { CreateReceiptRequest } from "@goho/goho-server-client/receipts";
import { Console, Effect, FileSystem, Schema } from "effect";
import { Argument, Command } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

const ReceiptFile = Schema.fromJsonString(CreateReceiptRequest);

/**
 * Saves one receipt from a JSON file and prints it. Every call saves a new
 * receipt, so running it twice on one file leaves two receipts.
 *
 * @category commands
 * @since 0.1.0
 */
export const createCommand = Command.make("create", {
  filePath: Argument.String("path").pipe(
    Argument.withDescription("Path to one JSON file describing the receipt and its items."),
  ),
}).pipe(
  Command.withDescription("Save one new receipt from a JSON file."),
  Command.withHandler(({ filePath }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const contents = yield* fileSystem.readFileString(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message: `Receipt file could not be read: ${filePath}`,
              cause,
            }),
        ),
      );
      // Unknown fields fail here rather than being silently dropped from the saved receipt.
      const payload = yield* Schema.decodeEffect(ReceiptFile)(contents, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message: `Receipt file is not a valid receipt: ${cause.message}`,
              cause,
            }),
        ),
      );
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.create({ payload }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                cause._tag === "BadRequest"
                  ? "The receipt was rejected. Check the file's values."
                  : "Receipt could not be created. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
);
