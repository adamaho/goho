import { Ai, GoogleDrive, GoogleSheets } from "@goho/core";
import { Effect, Result, Schema, Stream } from "effect";

import * as ReceiptModel from "./model.ts";
import * as ReceiptRepository from "./repository.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------------------------------
const Processed = Schema.TaggedStruct("Processed", {
  fileId: Schema.String,
  fileName: Schema.String,
});

const AlreadyProcessed = Schema.TaggedStruct("AlreadyProcessed", {
  fileId: Schema.String,
  fileName: Schema.String,
});

const FailureDisposition = Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]);
const ReceiptProcessingStage = Schema.Literals([
  "Claim",
  "ValidateFile",
  "DownloadFile",
  "ParseReceipt",
  "AppendRows",
  "Complete",
]);

const Failed = Schema.TaggedStruct("Failed", {
  fileId: Schema.String,
  fileName: Schema.String,
  stage: ReceiptProcessingStage,
  disposition: FailureDisposition,
  cause: Schema.Defect(),
});

const Stranded = Schema.TaggedStruct("Stranded", {
  fileId: Schema.String,
  fileName: Schema.String,
  stage: ReceiptProcessingStage,
  cause: Schema.Defect(),
  compensationCause: Schema.Defect(),
});

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

interface WorkflowFolders {
  readonly todo: string;
  readonly processing: string;
  readonly processed: string;
  readonly failed: string;
}

/**
 * Receipt that completed the workflow successfully.
 *
 * @category models
 * @since 0.1.0
 */
export interface Processed extends Schema.Schema.Type<typeof Processed> {}
/**
 * Receipt skipped because its source was already recorded.
 *
 * @category models
 * @since 0.1.0
 */
export interface AlreadyProcessed extends Schema.Schema.Type<typeof AlreadyProcessed> {}
/**
 * Receipt that failed with either a confirmed move to failed or an unconfirmed claim.
 *
 * @category models
 * @since 0.1.0
 */
export interface Failed extends Schema.Schema.Type<typeof Failed> {}
/**
 * Receipt left stranded after processing and compensation both failed.
 *
 * @category models
 * @since 0.1.0
 */
export interface Stranded extends Schema.Schema.Type<typeof Stranded> {}
/**
 * Outcome of processing one receipt file.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptProcessingResult = Processed | AlreadyProcessed | Failed | Stranded;

// ---------------------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Folder names required by the receipt workflow.
 *
 * @category constants
 * @since 0.1.0
 */
export const requiredFolders = ["todo", "processing", "processed", "failed"] as const;

const isString = Schema.is(Schema.String);

const supportedImageMimeTypes: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const receiptSystemPrompt = `Extract the receipt into the required structured receipt object.
- Expand recognizable abbreviations in store names and item names.
- Expand purchases with a quantity greater than one into one item entry per unit.
- Exclude purchased quantities such as (2) from each expanded item name.
- Associate item-specific sale, discount, coupon, and TPD/<item number> adjustment lines with the referenced item and subtract the adjustment from that item's price.
- Do not return sale, discount, coupon, or adjustment lines as separate item entries. Ignore them when they cannot be associated with a specific item.
- Apply item-specific adjustments before expanding quantities. When a quantity line shows a combined price, divide the adjusted total evenly across the expanded item entries so their prices sum to the adjusted line total.
- Infer one transaction category from the purchased items.
- Format the receipt date as YYYY-MM-DD.
- Return all prices, subtotal, tax, and total as numeric values without currency symbols.
- Preserve monetary values exactly as displayed on the receipt; do not convert currencies.
- Ignore payment methods, loyalty identifiers, and unrelated barcodes unless they are needed to identify the store or receipt date.`;

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

const RequiredFolder = Schema.Literals(requiredFolders);
const isRequiredFolder = Schema.is(RequiredFolder);

class MissingFoldersError extends Schema.TaggedError<MissingFoldersError>()(
  "GohoServer.Receipts.MissingFoldersError",
  {
    folders: Schema.Array(RequiredFolder),
    reason: Schema.Literals(["Missing", "Ambiguous"]),
  },
) {
  override get message(): string {
    if (this.reason === "Ambiguous") {
      return `Duplicate required Google Drive folders found: ${this.folders.join(", ")}. Each required folder name must be unique.`;
    }

    return `Missing required Google Drive folders. Please ensure the ${this.folders.join(", ")} have been created in the root folder.`;
  }
}

class ReceiptProcessingError extends Schema.TaggedError<ReceiptProcessingError>()(
  "GohoServer.Receipts.ReceiptProcessingError",
  {
    stage: ReceiptProcessingStage,
    cause: Schema.Defect(),
  },
) {}

// ---------------------------------------------------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------------------------------------------------

const resolveWorkflowFolders = Effect.fn("@goho/Receipts.resolveWorkflowFolders")(function* (
  folders: ReadonlyArray<GoogleDrive.FolderMetadata>,
) {
  const matches = new Map<(typeof requiredFolders)[number], Array<string>>(
    requiredFolders.map((name) => [name, []]),
  );

  for (const folder of folders) {
    if (isRequiredFolder(folder.name)) {
      matches.get(folder.name)?.push(folder.id);
    }
  }

  const ambiguousFolders = requiredFolders.filter((name) => (matches.get(name)?.length ?? 0) > 1);
  if (ambiguousFolders.length > 0) {
    return yield* new MissingFoldersError({ folders: ambiguousFolders, reason: "Ambiguous" });
  }

  const missingFolders = requiredFolders.filter((name) => matches.get(name)?.length === 0);
  if (missingFolders.length > 0) {
    return yield* new MissingFoldersError({ folders: missingFolders, reason: "Missing" });
  }

  return {
    todo: matches.get("todo")?.[0] ?? "",
    processing: matches.get("processing")?.[0] ?? "",
    processed: matches.get("processed")?.[0] ?? "",
    failed: matches.get("failed")?.[0] ?? "",
  } satisfies WorkflowFolders;
});

const readProcessedSourceIds = Effect.fn("@goho/Receipts.readProcessedSourceIds")(function* (
  spreadsheetId: string,
) {
  const googleSheets = yield* GoogleSheets.Service;
  const rows = yield* googleSheets.readRows({ spreadsheetId, range: "RAW!F:F" });
  const sourceIds = new Set<string>();

  for (const row of rows.slice(1)) {
    const value = row.at(0);
    if (!isString(value)) {
      continue;
    }

    const sourceId = value.trim();
    if (sourceId.length > 0) {
      sourceIds.add(sourceId);
    }
  }

  return sourceIds;
});

type ReceiptRow = readonly [
  store: string,
  date: string,
  category: string,
  item: string,
  price: number,
  sourceFileId: string,
];

const mapReceiptRows = (receipt: ReceiptModel.ReceiptToSave): ReadonlyArray<ReceiptRow> =>
  receipt.items.map((item) => [
    receipt.storeName,
    receipt.receiptDate,
    receipt.category,
    item.name,
    Number(item.amount),
    receipt.source.fileId,
  ]);

const saveReceiptBestEffort = Effect.fn("@goho/Receipts.saveReceiptBestEffort")(function* (
  receipt: ReceiptModel.ReceiptToSave,
) {
  const repository = yield* ReceiptRepository.Service;
  yield* repository.save(receipt).pipe(
    Effect.timeout("5 seconds"),
    Effect.asVoid,
    Effect.catch((error) =>
      Effect.logError("Receipt database save failed; continuing with Sheets", {
        sourceProvider: receipt.source.provider,
        fileId: receipt.source.fileId,
        operation: "save",
        errorType: error._tag,
      }),
    ),
  );
});

const parseReceipt = Effect.fn("@goho/Receipts.parseReceipt")(function* (
  file: GoogleDrive.FileMetadata,
) {
  if (!supportedImageMimeTypes.has(file.mimeType)) {
    return yield* new ReceiptProcessingError({
      stage: "ValidateFile",
      cause: `Unsupported receipt image MIME type: ${file.mimeType}`,
    });
  }

  yield* Effect.logDebug("Downloading receipt image", {
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType,
  });

  const googleDrive = yield* GoogleDrive.Service;
  const imageBytes = yield* googleDrive.downloadFile({ fileId: file.id }).pipe(
    Stream.mkUint8Array,
    Effect.mapError((cause) => new ReceiptProcessingError({ stage: "DownloadFile", cause })),
  );

  const ai = yield* Ai.Service;

  yield* Effect.logDebug("Parsing receipt image", {
    fileId: file.id,
    fileName: file.name,
    byteLength: imageBytes.byteLength,
  });

  return yield* ai
    .generateObject({
      objectName: "receipt",
      schema: ReceiptModel.ParsedReceipt,
      prompt: [
        {
          role: "system",
          content: receiptSystemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the structured receipt data from this image.",
            },
            {
              type: "file",
              mediaType: file.mimeType,
              fileName: file.name,
              data: imageBytes,
            },
          ],
        },
      ],
    })
    .pipe(Effect.mapError((cause) => new ReceiptProcessingError({ stage: "ParseReceipt", cause })));
});

const appendReceiptRows = Effect.fn("@goho/Receipts.appendReceiptRows")(function* (
  receipt: ReceiptModel.ReceiptToSave,
  spreadsheetId: string,
) {
  const googleSheets = yield* GoogleSheets.Service;
  const rows = mapReceiptRows(receipt);

  yield* Effect.logDebug("Appending receipt rows", {
    sourceFileId: receipt.source.fileId,
    spreadsheetId,
    rowCount: rows.length,
  });

  return yield* googleSheets
    .appendRows({
      spreadsheetId,
      range: "RAW!A:F",
      valueInputOption: "USER_ENTERED",
      rows,
    })
    .pipe(Effect.mapError((cause) => new ReceiptProcessingError({ stage: "AppendRows", cause })));
});

const completeReceipt = Effect.fn("@goho/Receipts.completeReceipt")(function* (
  fileId: string,
  folders: WorkflowFolders,
) {
  const googleDrive = yield* GoogleDrive.Service;

  yield* Effect.logDebug("Moving receipt to processed", { fileId });

  return yield* googleDrive
    .moveFile({
      fileId,
      sourceFolderId: folders.processing,
      destinationFolderId: folders.processed,
    })
    .pipe(Effect.mapError((cause) => new ReceiptProcessingError({ stage: "Complete", cause })));
});

const processReceipt = Effect.fn("@goho/Receipts.processReceipt")(function* (
  file: GoogleDrive.FileMetadata,
  folders: WorkflowFolders,
  spreadsheetId: string,
  processedSourceIds: ReadonlySet<string>,
): Effect.fn.Return<
  ReceiptProcessingResult,
  never,
  GoogleDrive.Service | GoogleSheets.Service | Ai.Service | ReceiptRepository.Service
> {
  const googleDrive = yield* GoogleDrive.Service;

  yield* Effect.logDebug("Claiming receipt", { fileId: file.id, fileName: file.name });

  const claim = yield* googleDrive
    .moveFile({
      fileId: file.id,
      sourceFolderId: folders.todo,
      destinationFolderId: folders.processing,
    })
    .pipe(Effect.result);

  if (Result.isFailure(claim)) {
    return Failed.make({
      fileId: file.id,
      fileName: file.name,
      stage: "Claim",
      disposition: "ClaimNotConfirmed",
      cause: claim.failure,
    });
  }

  yield* Effect.logDebug("Receipt claimed", { fileId: file.id, fileName: file.name });

  const processing = yield* Effect.gen(function* () {
    if (processedSourceIds.has(file.id)) {
      yield* Effect.logDebug("Receipt source already exists; skipping extraction", {
        fileId: file.id,
        fileName: file.name,
      });
      yield* completeReceipt(file.id, folders);
      return AlreadyProcessed.make({ fileId: file.id, fileName: file.name });
    }

    const parsed = yield* parseReceipt(file);
    const receipt = ReceiptModel.prepareReceipt(parsed, {
      provider: "google_drive",
      fileId: file.id,
      fileName: file.name,
    });
    yield* saveReceiptBestEffort(receipt);
    yield* appendReceiptRows(receipt, spreadsheetId);
    yield* completeReceipt(file.id, folders);
    return Processed.make({ fileId: file.id, fileName: file.name });
  }).pipe(Effect.result);

  if (Result.isSuccess(processing)) {
    yield* Effect.logInfo(
      processing.success._tag === "Processed" ? "Receipt processed" : "Receipt already processed",
      { fileId: file.id, fileName: file.name },
    );
    yield* Effect.logDebug("Receipt processing finished", {
      fileId: file.id,
      fileName: file.name,
      outcome: processing.success._tag,
    });
    return processing.success;
  }

  yield* Effect.logDebug("Compensating failed receipt", {
    fileId: file.id,
    fileName: file.name,
    stage: processing.failure.stage,
  });

  const compensation = yield* googleDrive
    .moveFile({
      fileId: file.id,
      sourceFolderId: folders.processing,
      destinationFolderId: folders.failed,
    })
    .pipe(Effect.result);

  if (Result.isFailure(compensation)) {
    return Stranded.make({
      fileId: file.id,
      fileName: file.name,
      stage: processing.failure.stage,
      cause: processing.failure.cause,
      compensationCause: compensation.failure,
    });
  }

  return Failed.make({
    fileId: file.id,
    fileName: file.name,
    stage: processing.failure.stage,
    disposition: "MovedToFailed",
    cause: processing.failure.cause,
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Processes every pending receipt and records its terminal outcome.
 *
 * @category workflows
 * @since 0.1.0
 */
export const process = Effect.fn("@goho/Receipts.process")(function* (
  rootFolderId: string,
  spreadsheetId: string,
  concurrency: number,
) {
  yield* Effect.logDebug("Starting receipt batch", {
    rootFolderId,
    spreadsheetId,
    concurrency,
  });

  const googleDrive = yield* GoogleDrive.Service;
  const folders = yield* googleDrive.listFolders({ folderId: rootFolderId });
  const workflowFolders = yield* resolveWorkflowFolders(folders);
  yield* Effect.logDebug("Resolved receipt workflow folders", workflowFolders);

  const processedSourceIds = yield* readProcessedSourceIds(spreadsheetId);
  yield* Effect.logDebug("Loaded processed receipt source IDs", {
    count: processedSourceIds.size,
  });

  const files = yield* googleDrive.listFiles({ folderId: workflowFolders.todo });
  yield* Effect.logDebug("Loaded todo receipts", { count: files.length });

  return yield* Effect.forEach(
    files,
    (file) => processReceipt(file, workflowFolders, spreadsheetId, processedSourceIds),
    { concurrency },
  );
});
