import * as GohoServer from "@goho/goho-server-client/client";
import { Concurrency, type ReceiptProcessingResult } from "@goho/goho-server-client/receipts";
import { Config, Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { FetchHttpClient } from "effect/unstable/http";

import { CommandError } from "#src/errors.ts";
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
      const baseUrl = yield* Config.string("GOHO_SERVER_URL").pipe(
        Config.withDefault("http://127.0.0.1:3000"),
      );
      const client = yield* GohoServer.make(baseUrl);
      const response = yield* client.receipts.list();
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "ConfigError"
                ? "Invalid CLI configuration. Check GOHO_SERVER_URL."
                : "Receipts could not be listed. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);

const processCommand = Command.make("process", {
  rootFolderId: Argument.string("root-folder-id").pipe(
    Argument.withDescription(
      `Google Drive folder containing the receipt workflow folders. This folder must contain todo, processing, processed, failed.`,
    ),
  ),
  spreadsheetId: Argument.string("spreadsheet-id").pipe(
    Argument.withDescription("Google Sheets spreadsheet that contains the RAW worksheet."),
  ),
  concurrency: Flag.integer("concurrency").pipe(
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
      const baseUrl = yield* Config.string("GOHO_SERVER_URL").pipe(
        Config.withDefault("http://127.0.0.1:3000"),
      );
      const client = yield* GohoServer.make(baseUrl);
      return yield* client.receipts.process({
        payload: { rootFolderId, spreadsheetId, concurrency },
      });
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.map((response) => response.data),
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "Conflict"
                ? "Another receipt batch is running. Wait for it to finish."
                : cause._tag === "ConfigError"
                  ? "Invalid CLI configuration. Check GOHO_SERVER_URL."
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
  Command.withSubcommands([listCommand, processCommand]),
);
