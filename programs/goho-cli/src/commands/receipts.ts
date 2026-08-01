import { GoogleDrive } from "@goho/core";
import { Effect, Layer, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { toCommandError } from "../errors.ts";
import { AiLive } from "../services/ai.ts";
import { GoogleAuthLive } from "../services/auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------

const requiredFolders = ["todo", "processing", "processed", "failed"] as const;
const RequiredFolder = Schema.Literals(requiredFolders);
const Concurrency = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 5 }, { expected: "an integer from 1 through 5" }),
);

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

class MissingFoldersError extends Schema.TaggedErrorClass<MissingFoldersError>()(
  "GohoCli.Receipts.MissingFoldersError",
  { folders: Schema.Array(RequiredFolder) },
) {
  override get message(): string {
    return `Missing required Google Drive folders. Please ensure the ${this.folders.join(", ")} have been created in the root folder.`;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------------------------------------------------

const GoogleDriveLive = GoogleDrive.layer.pipe(Layer.provide(GoogleAuthLive));
const ProcessLive = Layer.merge(GoogleDriveLive, AiLive);

// ---------------------------------------------------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------------------------------------------------
const process = Effect.fn("GohoCli.Receipts.process")(function* (
  rootFolderId: string,
  spreadsheetId: string,
  concurrency: number,
) {
  void spreadsheetId;
  void concurrency;

  const googleDrive = yield* GoogleDrive.Service;
  const folders = yield* googleDrive.listFolders({ folderId: rootFolderId });
  const folderNames = new Set(folders.map((folder) => folder.name));
  const missingFolders = requiredFolders.filter((folder) => !folderNames.has(folder));

  if (missingFolders.length > 0) {
    return yield* new MissingFoldersError({ folders: missingFolders });
  }

  yield* Effect.logInfo("Required Google Drive folders are available");
});

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
