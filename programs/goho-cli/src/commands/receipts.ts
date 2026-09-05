import { GoogleDrive, GoogleSheets } from "@goho/core";
import { Console, Effect, Layer, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CommandError, toCommandError } from "../errors.ts";
import { process, type ReceiptProcessingResult, requiredFolders } from "../receipts/process.ts";
import * as Ai from "../services/ai.ts";
import * as GoogleAuth from "../services/auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------
const Concurrency = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 5 }, { expected: "an integer from 1 through 5" }),
);

// ---------------------------------------------------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------------------------------------------------
const GoogleLive = Layer.merge(GoogleDrive.layer, GoogleSheets.layer).pipe(
  Layer.provide(GoogleAuth.layer),
);
const ProcessLive = Layer.merge(GoogleLive, Ai.layer);

// ---------------------------------------------------------------------------------------------------------------------
// Process Command
// ---------------------------------------------------------------------------------------------------------------------

const reportProcessResults = Effect.fn("GohoCli.Receipts.Process.reportProcessResults")(function* (
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
        yield* Effect.logDebug("Receipt failure cause", result.cause);
        break;
      case "Stranded":
        stranded += 1;
        yield* Console.log(`Stranded: ${result.fileName} (${result.fileId}) at ${result.stage}`);
        yield* Effect.logDebug("Receipt failure cause", result.cause);
        yield* Effect.logDebug("Receipt compensation cause", result.compensationCause);
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
      `Google Drive folder containing the receipt workflow folders. This folder must contain ${requiredFolders.join(",")}.`,
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
    process(rootFolderId, spreadsheetId, concurrency).pipe(
      Effect.provide(ProcessLive),
      Effect.mapError(toCommandError),
      Effect.andThen(reportProcessResults),
      Effect.tapError((error) => Effect.logDebug("Receipt process command failed", error.cause)),
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
  Command.withSubcommands([processCommand]),
);
