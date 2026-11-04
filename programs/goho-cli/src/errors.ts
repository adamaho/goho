import { Schema } from "effect";

/**
 * Stable categories for handled CLI failures, independent of message wording.
 *
 * @category models
 * @since 0.1.0
 */
export const ErrorCode = Schema.Literals([
  "invalid_input",
  "not_found",
  "conflict",
  "request_failed",
  "file_error",
  "configuration_error",
]);

/**
 * Decoded CLI error category.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorCode = typeof ErrorCode.Type;

/**
 * Safe command-line failure with its diagnostic cause.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommandError extends Schema.TaggedError<CommandError>()("GohoCli.CommandError", {
  code: ErrorCode,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Maps declared API errors to CLI categories. Transport, decoding, and other
 * request failures deliberately share a fallback until finer diagnosis is added.
 *
 * @category mapping
 * @since 0.1.0
 */
export const getRequestErrorCode = (cause: { readonly _tag: string }): ErrorCode => {
  switch (cause._tag) {
    case "BadRequest":
      return "invalid_input";
    case "NotFound":
    case "BookNotFound":
    case "BookImageNotFound":
    case "BookUploadNotFound":
      return "not_found";
    case "Conflict":
    case "BookConflict":
    case "BookUploadConflict":
      return "conflict";
    default:
      return "request_failed";
  }
};
