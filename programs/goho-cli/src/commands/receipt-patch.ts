import {
  PatchReceiptItemRequest,
  PatchReceiptRequest,
  ReceiptId,
  ReceiptItemId,
} from "@goho/goho-server-client/receipts";
import { Console, Effect, Option, Schema, type Types } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

/**
 * Corrects supplied receipt details and prints the saved receipt.
 *
 * @category commands
 * @since 0.1.0
 */
export const patchCommand = Command.make("patch", {
  receiptId: Argument.String("receipt-id").pipe(
    Argument.withSchema(ReceiptId),
    Argument.withDescription("Positive integer ID of the persisted receipt to patch."),
  ),
  storeName: Flag.String("store-name").pipe(
    Flag.withDescription("Corrected store or merchant name."),
    Flag.optional,
  ),
  receiptDate: Flag.String("receipt-date").pipe(
    Flag.withDescription("Corrected purchase date in YYYY-MM-DD format."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Correct receipt details; supply at least one field."),
  Command.withHandler(({ receiptId, storeName, receiptDate }) =>
    Effect.gen(function* () {
      const changes: Types.Mutable<PatchReceiptRequest> = {};
      if (Option.isSome(storeName)) changes.storeName = storeName.value;
      if (Option.isSome(receiptDate)) changes.receiptDate = receiptDate.value;
      const payload = yield* Schema.decodeEffect(PatchReceiptRequest)(changes).pipe(
        Effect.mapError(
          () =>
            new CommandError({
              type: "goho:cli:invalid-input",
              detail:
                "Supply at least one of --store-name or --receipt-date. Names must be nonblank and dates must be real dates in YYYY-MM-DD format.",
            }),
        ),
      );
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.patch({ params: { receiptId }, payload });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Corrects one persisted item's name or category and prints the saved item.
 *
 * @category commands
 * @since 0.1.0
 */
export const patchItemCommand = Command.make("patch-item", {
  receiptId: Argument.String("receipt-id").pipe(
    Argument.withSchema(ReceiptId),
    Argument.withDescription("Positive integer ID of the receipt containing the item."),
  ),
  itemId: Argument.String("item-id").pipe(
    Argument.withSchema(ReceiptItemId),
    Argument.withDescription("Persisted item ID returned by receipts view or list."),
  ),
  name: Flag.String("name").pipe(
    Flag.withDescription("Corrected nonblank item name."),
    Flag.optional,
  ),
  category: Flag.String("category").pipe(
    Flag.withDescription("Corrected nonblank item category name."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Correct one persisted receipt item; supply at least one field."),
  Command.withHandler(({ receiptId, itemId, name, category }) =>
    Effect.gen(function* () {
      const changes: Types.Mutable<PatchReceiptItemRequest> = {};
      if (Option.isSome(name)) changes.name = name.value;
      if (Option.isSome(category)) changes.category = category.value;
      const payload = yield* Schema.decodeEffect(PatchReceiptItemRequest)(changes).pipe(
        Effect.mapError(
          () =>
            new CommandError({
              type: "goho:cli:invalid-input",
              detail: "Supply --name, --category, or both. Values must be nonblank.",
            }),
        ),
      );
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.patchItem({ params: { receiptId, itemId }, payload });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);
