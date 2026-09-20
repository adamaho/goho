import {
  Concurrency,
  ReceiptId,
  type ReceiptProcessingResult,
} from "@goho/goho-server-client/receipts";
import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

const reportProcessResults = Effect.fn("@goho/Receipts.reportProcessResults")(function* (
  results: ReadonlyArray<ReceiptProcessingResult>,
) {
  let processed = 0;
  let alreadyProcessed = 0;
  let failed = 0;
  let stranded = 0;

  for (const result of results) {
    switch (result._tag) {
      case "Processed":
        processed += 1;
        break;
      case "AlreadyProcessed":
        alreadyProcessed += 1;
        break;
      case "Failed":
        failed += 1;
        yield* Console.log(
          `Failed: ${result.fileName} (${result.fileId}) at ${result.stage}; disposition=${result.disposition}`,
        );
        break;
      case "Stranded":
        stranded += 1;
        yield* Console.log(`Stranded: ${result.fileName} (${result.fileId}) at ${result.stage}`);
        break;
    }
  }

  yield* Console.log(
    [
      `Processed: ${processed}`,
      `Already processed: ${alreadyProcessed}`,
      `Failed: ${failed}`,
      `Stranded: ${stranded}`,
    ].join("\n"),
  );

  if (failed > 0 || stranded > 0) {
    return yield* new CommandError({
      message: "Receipt processing completed with failures. Review the summary above.",
      cause: results,
    });
  }
});

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

const showCommand = Command.make("show", {
  receiptId: Argument.String("receipt-id").pipe(
    Argument.withSchema(ReceiptId),
    Argument.withDescription("Positive integer ID of the persisted receipt to show."),
  ),
}).pipe(
  Command.withDescription("Show one persisted receipt."),
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

const processCommand = Command.make("process", {
  rootFolderId: Argument.String("root-folder-id").pipe(
    Argument.withDescription(
      `Google Drive folder containing the receipt workflow folders. This folder must contain todo, processing, processed, failed.`,
    ),
  ),
  spreadsheetId: Argument.String("spreadsheet-id").pipe(
    Argument.withDescription("Google Sheets spreadsheet that contains the RAW worksheet."),
  ),
  concurrency: Flag.Int("concurrency").pipe(
    Flag.withSchema(Concurrency),
    Flag.withDefault(5),
    Flag.withDescription(
      "Maximum number of receipts to process concurrently, from 1 through 5 (default: 5).",
    ),
  ),
}).pipe(
  Command.withDescription("Process all receipts in the 'todo' google drive folder."),
  Command.withHandler(({ concurrency, rootFolderId, spreadsheetId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      return yield* client.receipts.process({
        payload: { rootFolderId, spreadsheetId, concurrency },
      });
    }).pipe(
      Effect.map((response) => response.data),
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "Conflict"
                ? "Another receipt batch is running. Wait for it to finish."
                : "Receipt processing could not be confirmed. Work may have completed. Check server logs and Drive folders before running again.",
            cause,
          }),
      ),
      Effect.andThen(reportProcessResults),
    ),
  ),
);

/**
 * Command group for receipt-processing operations.
 *
 * @category commands
 * @since 0.1.0
 */
export const receiptsCommand = Command.make("receipts").pipe(
  Command.withDescription("Manage receipts"),
  Command.withSubcommands([listCommand, showCommand, processCommand]),
);
