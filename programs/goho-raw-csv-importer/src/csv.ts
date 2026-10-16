import { CsvError } from "csv-parse";
import { parse } from "csv-parse/sync";
import { Result, Schema } from "effect";

/**
 * Location of one CSV record. Record 1 is the header, so record numbers match
 * spreadsheet row numbers; lines differ when quoted fields contain newlines.
 *
 * @category models
 * @since 0.1.0
 */
export interface SourceRef {
  readonly record: number;
  readonly firstLine: number;
  readonly lastLine: number;
}

/**
 * One parsed CSV record with unmodified field text.
 *
 * @category models
 * @since 0.1.0
 */
export interface SourceRecord extends SourceRef {
  readonly fields: ReadonlyArray<string>;
}

/**
 * The file cannot be parsed as CSV. Parsing stops at the first malformed quote
 * because later record boundaries are no longer trustworthy.
 *
 * @category errors
 * @since 0.1.0
 */
export class MalformedCsv extends Schema.TaggedError<MalformedCsv>()(
  "RawCsvImporter.MalformedCsv",
  { message: Schema.String },
) {}

/**
 * Formats a record reference for reports.
 *
 * @category formatting
 * @since 0.1.0
 */
export const formatRef = (ref: SourceRef) =>
  ref.firstLine === ref.lastLine
    ? `record ${ref.record}, line ${ref.firstLine}`
    : `record ${ref.record}, lines ${ref.firstLine}-${ref.lastLine}`;

/**
 * Parses CSV text with RFC 4180 quoting, including quoted commas, doubled
 * quotes, and embedded newlines. Records with an unexpected field count are
 * returned as-is so callers can report them alongside other record errors.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parseRecords = (
  text: string,
): Result.Result<ReadonlyArray<SourceRecord>, MalformedCsv> => {
  const records: Array<SourceRecord> = [];
  try {
    parse(text, {
      bom: true,
      relax_column_count: true,
      on_record: (fields, context) => {
        // Unquoted line breaks end records, so a record spans one line plus the
        // breaks preserved inside its quoted values. The parser's own line count
        // treats a quoted CRLF as two lines.
        const firstLine = (records.at(-1)?.lastLine ?? 0) + 1;
        const breaks = fields.reduce(
          (count, field) => count + (field.match(/\r\n|\r|\n/gu)?.length ?? 0),
          0,
        );
        records.push({ record: context.records, firstLine, lastLine: firstLine + breaks, fields });
        return fields;
      },
    });
    return Result.succeed(records);
  } catch (error) {
    if (error instanceof CsvError) {
      return Result.fail(
        new MalformedCsv({
          message: `${error.message}. No records were validated after this point.`,
        }),
      );
    }
    throw error;
  }
};
