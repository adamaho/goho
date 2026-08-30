import { Ai, GoogleDrive, GoogleSheets } from "@goho/core";
import { Effect, Result, Schema, Stream } from "effect";

// ---------------------------------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------------------------------
const Name = Schema.Trim.check(Schema.isNonEmpty());

const ReceiptDate = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }

      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const date = new Date(Date.UTC(year, month - 1, day));

      return (
        year >= 2025 &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    {
      expected: "a real calendar date in YYYY-MM-DD format with a year of 2025 or later",
      toJsonSchema: () => ({
        pattern: "^(?:202[5-9]|20[3-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})-\\d{2}-\\d{2}$",
      }),
    },
  ),
);

const Receipt = Schema.Struct({
  store: Schema.Struct({
    name: Name,
  }),
  date: ReceiptDate,
  transaction: Schema.Struct({
    items: Schema.NonEmptyArray(
      Schema.Struct({
        name: Name,
        price: Schema.Finite,
      }),
    ),
    category: Name,
    subtotal: Schema.Finite,
    tax: Schema.Finite,
    total: Schema.Finite,
  }),
});

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

interface Receipt extends Schema.Schema.Type<typeof Receipt> {}

interface WorkflowFolders {
  readonly todo: string;
  readonly processing: string;
  readonly processed: string;
  readonly failed: string;
}

export interface Processed extends Schema.Schema.Type<typeof Processed> {}
export interface AlreadyProcessed extends Schema.Schema.Type<typeof AlreadyProcessed> {}
export interface Failed extends Schema.Schema.Type<typeof Failed> {}
export interface Stranded extends Schema.Schema.Type<typeof Stranded> {}
export type ReceiptProcessingResult = Processed | AlreadyProcessed | Failed | Stranded;

// ---------------------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------------------
export const requiredFolders = ["todo", "processing", "processed", "failed"] as const;

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
  "GohoCli.Receipts.MissingFoldersError",
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
  "GohoCli.Receipts.ReceiptProcessingError",
  {
    stage: ReceiptProcessingStage,
    cause: Schema.Defect(),
  },
) {}

// ---------------------------------------------------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------------------------------------------------

const resolveWorkflowFolders = Effect.fn("GohoCli.Receipts.resolveWorkflowFolders")(function* (
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

const readProcessedSourceIds = Effect.fn("GohoCli.Receipts.readProcessedSourceIds")(function* (
  spreadsheetId: string,
) {
  const googleSheets = yield* GoogleSheets.Service;
  const rows = yield* googleSheets.readRows({ spreadsheetId, range: "RAW!F:F" });
  const sourceIds = new Set<string>();

  for (const row of rows.slice(1)) {
    const value = row.at(0);
    if (typeof value !== "string") {
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

const mapReceiptRows = (receipt: Receipt, sourceFileId: string): ReadonlyArray<ReceiptRow> =>
  receipt.transaction.items.map((item) => [
    receipt.store.name,
    receipt.date,
    receipt.transaction.category,
    item.name.replace(/\s+\(\d+\)$/, ""),
    item.price,
    sourceFileId,
  ]);

const parseReceipt = Effect.fn("GohoCli.Receipts.parseReceipt")(function* (
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
      schema: Receipt,
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

const appendReceiptRows = Effect.fn("GohoCli.Receipts.appendReceiptRows")(function* (
  receipt: Receipt,
  sourceFileId: string,
  spreadsheetId: string,
) {
  const googleSheets = yield* GoogleSheets.Service;
  const rows = mapReceiptRows(receipt, sourceFileId);

  yield* Effect.logDebug("Appending receipt rows", {
    sourceFileId,
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

const completeReceipt = Effect.fn("GohoCli.Receipts.completeReceipt")(function* (
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

const processReceipt = Effect.fn("GohoCli.Receipts.processReceipt")(function* (
  file: GoogleDrive.FileMetadata,
  folders: WorkflowFolders,
  spreadsheetId: string,
  processedSourceIds: ReadonlySet<string>,
): Effect.fn.Return<
  ReceiptProcessingResult,
  never,
  GoogleDrive.Service | GoogleSheets.Service | Ai.Service
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

    const receipt = yield* parseReceipt(file);
    yield* appendReceiptRows(receipt, file.id, spreadsheetId);
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
export const process = Effect.fn("GohoCli.Receipts.process")(function* (
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
