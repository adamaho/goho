import { GoogleAuth, GoogleDrive, GoogleSheets } from "@goho/core";
import { Config, Schema } from "effect";

/**
 * Safe command-line failure with its diagnostic cause.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommandError extends Schema.TaggedError<CommandError>()("GohoCli.CommandError", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Converts receipt workflow failures into safe command-line messages.
 *
 * @category errors
 * @since 0.1.0
 */
export function toCommandError(
  cause:
    | Config.ConfigError
    | GoogleAuth.AuthenticationError
    | GoogleDrive.DriveError
    | GoogleSheets.SheetsError
    | { readonly _tag: "GohoCli.Receipts.MissingFoldersError"; readonly message: string },
): CommandError {
  switch (cause._tag) {
    case "GoogleAuth.AuthenticationError":
      return new CommandError({
        message:
          cause.operation === "initialize"
            ? "Unable to load the Google service-account JSON key. Verify the configured file path."
            : "Google authentication failed. Verify the service-account configuration.",
        cause,
      });
    case "GoogleDrive.DriveError":
      return new CommandError({
        message:
          "Unable to access the Google Drive receipt workflow. Verify that the folder is shared with the service account.",
        cause,
      });
    case "GoogleSheets.SheetsError":
      return new CommandError({
        message:
          "Unable to read the Google Sheets receipt data. Verify that the spreadsheet is shared with the service account.",
        cause,
      });
    case "GohoCli.Receipts.MissingFoldersError":
      return new CommandError({ message: cause.message, cause });
    case "ConfigError":
      return new CommandError({
        message: `Invalid CLI configuration: ${cause.message}`,
        cause,
      });
  }
}
