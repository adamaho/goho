import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { Context, Effect, Layer, Schema } from "effect";

import * as GoogleAuth from "./auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------

export type CellValue = string | number | boolean;
export type Row = ReadonlyArray<CellValue>;

export interface ReadRowsOptions {
  readonly spreadsheetId: string;
  readonly range: string;
}

export interface AppendRowsOptions {
  readonly spreadsheetId: string;
  readonly range: string;
  readonly valueInputOption: "RAW" | "USER_ENTERED";
  readonly rows: ReadonlyArray<Row>;
}

export type AppendRowsResult = sheets_v4.Schema$AppendValuesResponse;

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

export class SheetsError extends Schema.TaggedErrorClass<SheetsError>()(
  "GoogleSheets.SheetsError",
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

export interface Interface {
  readonly readRows: (options: ReadRowsOptions) => Effect.Effect<ReadonlyArray<Row>, SheetsError>;
  readonly appendRows: (options: AppendRowsOptions) => Effect.Effect<AppendRowsResult, SheetsError>;
}

export class Service extends Context.Service<Service, Interface>()("@goho/google/Sheets") {}

export const make = Effect.gen(function* () {
  const auth = yield* GoogleAuth.Service;
  const client = sheets("v4");

  const readRows = Effect.fn("GoogleSheets.readRows")(function* (options: ReadRowsOptions) {
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

  const appendRows = Effect.fn("GoogleSheets.appendRows")(function* (options: AppendRowsOptions) {
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

export const layer = Layer.effect(Service, make);
