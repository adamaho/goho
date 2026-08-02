import { Ai, GoogleDrive } from "@goho/core";
import { Effect, Schema, Stream } from "effect";

// ---------------------------------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------------------------------
const Name = Schema.Trim.check(Schema.isNonEmpty());

const ReceiptDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(
    (value) => {
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
- Represent discounts and TPD/<item number> adjustments as negative item prices.
- Infer one transaction category from the purchased items.
- Format the receipt date as YYYY-MM-DD.
- Return all prices, subtotal, tax, and total as numeric values without currency symbols.
- Preserve monetary values exactly as displayed on the receipt; do not convert currencies.
- Ignore payment methods, loyalty identifiers, and unrelated barcodes unless they are needed to identify the store or receipt date.`;

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

const RequiredFolder = Schema.Literals(requiredFolders);

class MissingFoldersError extends Schema.TaggedErrorClass<MissingFoldersError>()(
  "GohoCli.Receipts.MissingFoldersError",
  { folders: Schema.Array(RequiredFolder) },
) {
  override get message(): string {
    return `Missing required Google Drive folders. Please ensure the ${this.folders.join(", ")} have been created in the root folder.`;
  }
}

const ReceiptProcessingStage = Schema.Literals([
  "ClaimFile",
  "ValidateFile",
  "DownloadFile",
  "ParseReceipt",
  "AppendRows",
  "Complete",
]);

class ReceiptProcessingError extends Schema.TaggedErrorClass<ReceiptProcessingError>()(
  "GohoCli.Receipts.ReceiptProcessingError",
  {
    stage: ReceiptProcessingStage,
    cause: Schema.Defect(),
  },
) {}

// ---------------------------------------------------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------------------------------------------------
const _parseReceipt = Effect.fn("GohoCli.Receipts.parseReceipt")(function* (
  file: GoogleDrive.FileMetadata,
) {
  if (!supportedImageMimeTypes.has(file.mimeType)) {
    return yield* new ReceiptProcessingError({
      stage: "ValidateFile",
      cause: `Unsupported receipt image MIME type: ${file.mimeType}`,
    });
  }

  const googleDrive = yield* GoogleDrive.Service;
  const imageBytes = yield* googleDrive.downloadFile({ fileId: file.id }).pipe(
    Stream.mkUint8Array,
    Effect.mapError((cause) => new ReceiptProcessingError({ stage: "DownloadFile", cause })),
  );

  const ai = yield* Ai.Service;

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

void _parseReceipt;

// ---------------------------------------------------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------------------------------------------------

export const process = Effect.fn("GohoCli.Receipts.process")(function* (
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
