import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { CommandError, getRequestErrorCode } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";
import { saveImageFile } from "#src/utils/save-image-file.ts";

/**
 * Saves one receipt's stored scanned image to a file and describes the saved file.
 *
 * @category commands
 * @since 0.1.0
 */
export const imageCommand = Command.make("image", {
  receiptId: Argument.String("receipt-id").pipe(
    Argument.withSchema(ReceiptId),
    Argument.withDescription("Positive integer ID of the persisted receipt."),
  ),
  output: Flag.String("output").pipe(
    Flag.withDescription("File to save to. Defaults to receipt-<id> with the image's extension."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Save one receipt's stored scanned image to a file."),
  Command.withHandler(({ receiptId, output }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.getImage({ params: { receiptId } }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              code: getRequestErrorCode(cause),
              message:
                cause._tag === "NotFound"
                  ? `Receipt ${receiptId} was not found or has no scanned image.`
                  : "Receipt image could not be retrieved. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      const saved = yield* saveImageFile({
        label: "Receipt image",
        defaultName: `receipt-${receiptId}`,
        bytes: response.body,
        contentType: response.headers["content-type"],
        output,
      });
      yield* Console.log(JSON.stringify(saved, null, 2));
    }),
  ),
);
