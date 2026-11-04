import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";
import { DeleteResult } from "#src/response.ts";

import { createCommand } from "./receipt-create.ts";
import { imageCommand } from "./receipt-image.ts";
import { patchCommand, patchItemCommand } from "./receipt-patch.ts";
import { uploadsCommand } from "./receipt-uploads.ts";

const listCommand = Command.make("list").pipe(
  Command.withDescription("List all persisted receipts."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.list();
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message: "Receipts could not be listed. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

const viewCommand = Command.make("view", {
  receiptId: Argument.String("receipt-id").pipe(
    Argument.withSchema(ReceiptId),
    Argument.withDescription("Positive integer ID of the persisted receipt to view."),
  ),
}).pipe(
  Command.withDescription("View one persisted receipt."),
  Command.withHandler(({ receiptId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.get({ params: { receiptId } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "NotFound"
                ? `Receipt ${receiptId} was not found.`
                : "Receipt could not be retrieved. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

const deleteCommand = Command.make("delete", {
  receiptId: Argument.String("receipt-id").pipe(
    Argument.withSchema(ReceiptId),
    Argument.withDescription("Positive integer ID of the persisted receipt to delete."),
  ),
}).pipe(
  Command.withDescription("Permanently delete one persisted receipt and its scanned image."),
  Command.withHandler(({ receiptId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      yield* client.receipts.delete({ params: { receiptId } });
      const result = yield* DeleteResult.makeEffect({
        deleted: true,
        resource: "receipt",
        id: receiptId,
      });
      yield* Console.log(JSON.stringify(result, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "NotFound"
                ? `Receipt ${receiptId} was not found.`
                : "Receipt could not be deleted. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

/**
 * Command group for receipt uploads, retrieval, creation, corrections, and deletion.
 *
 * @category commands
 * @since 0.1.0
 */
export const receiptsCommand = Command.make("receipts").pipe(
  Command.withDescription("Manage receipts"),
  Command.withSubcommands([
    listCommand,
    viewCommand,
    imageCommand,
    createCommand,
    patchCommand,
    patchItemCommand,
    deleteCommand,
    uploadsCommand,
  ]),
);
