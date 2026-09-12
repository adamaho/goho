import * as GohoServer from "@goho/goho-server-client/client";
import {
  Concurrency,
  type ImportSheetsRawResult,
  type ReceiptProcessingResult,
} from "@goho/goho-server-client/receipts";
import { Config, Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { FetchHttpClient } from "effect/unstable/http";

import { CommandError } from "../errors.ts";
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

const reportImportResults = Effect.fn("@goho/Receipts.reportImportResults")(function* (
  result: ImportSheetsRawResult,
) {
  const rejectLines = result.rejects.map((reject) => `  row ${reject.row}: ${reject.reason}`);
  if (result.apply) {
    yield* Console.log(
      [
        `Imported: ${result.imported}`,
        `Skipped already present: ${result.skippedAlreadyPresent}`,
        `Skipped invalid: ${result.skippedInvalid}`,
        ...(rejectLines.length > 0 ? ["Rejects:", ...rejectLines] : []),
      ].join("\n"),
    );
    return;
  }

  yield* Console.log(
    [
      `Dry-run receipts: ${result.receiptCount}`,
      `Sample source ids: ${result.sampleSourceIds.join(", ") || "(none)"}`,
      `Skipped invalid: ${result.skippedInvalid}`,
      ...(rejectLines.length > 0 ? ["Rejects:", ...rejectLines] : []),
    ].join("\n"),
  );
});

const importSheetsRawCommand = Command.make("import-sheets-raw", {
  spreadsheetId: Argument.string("spreadsheet-id").pipe(
    Argument.withDescription("Google Sheets spreadsheet that contains the RAW worksheet."),
  ),
  worksheet: Flag.string("worksheet").pipe(
    Flag.withDefault("RAW"),
    Flag.withDescription("Worksheet name containing columns A-F (default: RAW)."),
  ),
  apply: Flag.boolean("apply").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Write mapped receipts to Postgres. Default is a dry-run."),
  ),
}).pipe(
  Command.withDescription(
    "Import historical RAW sheet rows into Postgres without changing Sheets.",
  ),
  Command.withHandler(({ apply, spreadsheetId, worksheet }) =>
    Effect.gen(function* () {
      const baseUrl = yield* Config.string("GOHO_SERVER_URL").pipe(
        Config.withDefault("http://127.0.0.1:3000"),
      );
      const client = yield* GohoServer.make(baseUrl);
      return yield* client.receipts.importSheetsRaw({
        payload: { spreadsheetId, worksheet, apply },
      });
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "ConfigError"
                ? "Invalid CLI configuration. Check GOHO_SERVER_URL."
                : "Sheets RAW import could not be confirmed. Check server logs before running again.",
            cause,
          }),
      ),
      Effect.andThen(reportImportResults),
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
  Command.withSubcommands([processCommand, importSheetsRawCommand]),
);
