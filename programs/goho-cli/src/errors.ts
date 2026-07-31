import { GoogleAuth, GoogleDrive } from "@goho/core";
import { Config, Schema } from "effect";

export class CommandError extends Schema.TaggedErrorClass<CommandError>()("GohoCli.CommandError", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Converts receipt workflow failures into safe command-line messages.
 *
 * @param cause - The internal failure raised while processing receipts.
 * @returns A command error that retains the cause for diagnostics.
 */
export function toCommandError(
  cause:
    | Config.ConfigError
    | GoogleAuth.AuthenticationError
    | GoogleDrive.DriveError
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
    case "GohoCli.Receipts.MissingFoldersError":
      return new CommandError({ message: cause.message, cause });
    case "ConfigError":
      return new CommandError({
        message: `Invalid CLI configuration: ${cause.message}`,
        cause,
      });
  }
}
