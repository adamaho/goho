import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { Context, Effect, Layer, Schema } from "effect";

import * as GoogleAuth from "./auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Scalar value stored in a spreadsheet cell.
 *
 * @category models
 * @since 0.1.0
 */
export type CellValue = string | number | boolean;
/**
 * Immutable row returned from or appended to a spreadsheet.
 *
 * @category models
 * @since 0.1.0
 */
export type Row = ReadonlyArray<CellValue>;

/**
 * Options for reading rows from a spreadsheet range.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReadRowsOptions {
  readonly spreadsheetId: string;
  readonly range: string;
}

/**
 * Options for appending rows to a spreadsheet range.
 *
 * @category models
 * @since 0.1.0
 */
export interface AppendRowsOptions {
  readonly spreadsheetId: string;
  readonly range: string;
  readonly valueInputOption: "RAW" | "USER_ENTERED";
  readonly rows: ReadonlyArray<Row>;
}

/**
 * Response returned after rows are appended.
 *
 * @category models
 * @since 0.1.0
 */
export type AppendRowsResult = sheets_v4.Schema$AppendValuesResponse;

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Describes a failed Google Sheets operation.
 *
 * @category errors
 * @since 0.1.0
 */
export class SheetsError extends Schema.TaggedError<SheetsError>()(
  "@goho/GoogleSheets.SheetsError",
  {
    operation: Schema.Literals(["readRows", "appendRows"]),
    message: Schema.String,
  },
) {}

type Operation = "readRows" | "appendRows";

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Returns a safe message for an unknown Google client failure.
 *
 * @param error - The value caught at the Google client boundary.
 * @returns A message suitable for the typed Sheets error.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google Sheets request failed";
}

/**
 * Converts an unknown Google client failure to the service error type.
 *
 * @param operation - The Sheets operation that failed.
 * @param error - The value caught at the Google client boundary.
 * @returns A typed Sheets service error.
 */
function clientError(operation: Operation, error: unknown): SheetsError {
  return new SheetsError({
    operation,
    message: errorMessage(error),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Row operations exposed by the Google Sheets service.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly readRows: (options: ReadRowsOptions) => Effect.Effect<ReadonlyArray<Row>, SheetsError>;
  readonly appendRows: (options: AppendRowsOptions) => Effect.Effect<AppendRowsResult, SheetsError>;
}

/**
 * Service identifier for Google Sheets operations.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/google/Sheets") {}

/**
 * Constructs the Google Sheets service.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const auth = yield* GoogleAuth.Service;
  const client = sheets("v4");

  const readRows = Effect.fn("@goho/GoogleSheets.readRows")(function* (options: ReadRowsOptions) {
    const headers = yield* auth
      .getRequestHeaders()
      .pipe(Effect.mapError((error) => clientError("readRows", error)));

    const response = yield* Effect.tryPromise({
      try: () =>
        client.spreadsheets.values.get(
          {
            spreadsheetId: options.spreadsheetId,
            range: options.range,
            majorDimension: "ROWS",
            valueRenderOption: "UNFORMATTED_VALUE",
            fields: "values",
          },
          { headers },
        ),
      catch: (error) => clientError("readRows", error),
    });

    return response.data.values ?? [];
  });

  const appendRows = Effect.fn("@goho/GoogleSheets.appendRows")(function* (
    options: AppendRowsOptions,
  ) {
    if (options.rows.length === 0) {
      return yield* new SheetsError({
        operation: "appendRows",
        message: "At least one row is required",
      });
    }

    const headers = yield* auth
      .getRequestHeaders()
      .pipe(Effect.mapError((error) => clientError("appendRows", error)));

    const response = yield* Effect.tryPromise({
      try: () =>
        client.spreadsheets.values.append(
          {
            spreadsheetId: options.spreadsheetId,
            range: options.range,
            valueInputOption: options.valueInputOption,
            insertDataOption: "INSERT_ROWS",
            fields: "spreadsheetId,updates(updatedRange,updatedRows,updatedCells)",
            requestBody: {
              majorDimension: "ROWS",
              values: options.rows.map((row) => Array.from(row)),
            },
          },
          { headers },
        ),
      catch: (error) => clientError("appendRows", error),
    });

    return response.data;
  });

  return Service.of({ readRows, appendRows });
});

/**
 * Provides Google Sheets operations using the configured authentication service.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make);
