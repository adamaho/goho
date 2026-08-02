import { GoogleDrive, GoogleSheets } from "@goho/core";
import { Effect, Layer, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { toCommandError } from "../errors.ts";
import { process, requiredFolders } from "../receipts/process.ts";
import { AiLive } from "../services/ai.ts";
import { GoogleAuthLive } from "../services/auth.ts";

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
  Layer.provide(GoogleAuthLive),
);
const ProcessLive = Layer.merge(GoogleLive, AiLive);

// ---------------------------------------------------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------------------------------------------------

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
    ),
  ),
);

export const receiptsCommand = Command.make("receipts").pipe(
  Command.withDescription("Manage receipts"),
  Command.withSubcommands([processCommand]),
);
