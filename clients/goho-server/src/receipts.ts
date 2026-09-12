import { Schema } from "effect";

/**
 * Maximum concurrent receipts in a batch.
 *
 * @category models
 * @since 0.1.0
 */
export const Concurrency = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }));

/**
 * Inputs for one synchronous receipt batch.
 *
 * @category models
 * @since 0.1.0
 */
export const ProcessRequest = Schema.Struct({
  rootFolderId: Schema.Trim.check(Schema.isNonEmpty()),
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()),
  concurrency: Concurrency,
});

/**
 * Decoded receipt batch inputs.
 *
 * @category models
 * @since 0.1.0
 */
export interface ProcessRequest extends Schema.Schema.Type<typeof ProcessRequest> {}

const File = { fileId: Schema.String, fileName: Schema.String };
const Stage = Schema.Literals([
  "Claim",
  "ValidateFile",
  "DownloadFile",
  "ParseReceipt",
  "AppendRows",
  "Complete",
]);

/**
 * Public receipt outcomes; diagnostic causes stay on the server.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptProcessingResult = Schema.Union([
  Schema.TaggedStruct("Processed", File),
  Schema.TaggedStruct("AlreadyProcessed", File),
  Schema.TaggedStruct("Failed", {
    ...File,
    stage: Stage,
    disposition: Schema.Literals(["MovedToFailed", "ClaimNotConfirmed"]),
  }),
  Schema.TaggedStruct("Stranded", { ...File, stage: Stage }),
]);

/**
 * Decoded public outcome for one receipt.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptProcessingResult = Schema.Schema.Type<typeof ReceiptProcessingResult>;

/**
 * Inputs for a one-shot Sheets RAW import into Postgres.
 *
 * @category models
 * @since 0.1.0
 */
export const ImportSheetsRawRequest = Schema.Struct({
  spreadsheetId: Schema.Trim.check(Schema.isNonEmpty()),
  worksheet: Schema.Trim.check(Schema.isNonEmpty()),
  apply: Schema.Boolean,
});

/**
 * Decoded Sheets RAW import inputs.
 *
 * @category models
 * @since 0.1.0
 */
export interface ImportSheetsRawRequest extends Schema.Schema.Type<typeof ImportSheetsRawRequest> {}

/**
 * One RAW row rejected because a required field was empty or invalid.
 *
 * @category models
 * @since 0.1.0
 */
export const ImportSheetsRawReject = Schema.Struct({
  row: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  reason: Schema.String,
});

/**
 * Dry-run or apply summary for a Sheets RAW import.
 *
 * @category models
 * @since 0.1.0
 */
export const ImportSheetsRawResult = Schema.Struct({
  apply: Schema.Boolean,
  receiptCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sampleSourceIds: Schema.Array(Schema.String),
  imported: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  skippedAlreadyPresent: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  skippedInvalid: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  rejects: Schema.Array(ImportSheetsRawReject),
});

/**
 * Decoded Sheets RAW import summary.
 *
 * @category models
 * @since 0.1.0
 */
export interface ImportSheetsRawResult extends Schema.Schema.Type<typeof ImportSheetsRawResult> {}
