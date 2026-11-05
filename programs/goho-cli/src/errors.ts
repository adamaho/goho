import { ErrorCode, type ErrorResponse } from "@goho/goho-server-client/response";
import { Schema } from "effect";

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
export const getRequestErrorCode = (
  cause: { readonly _tag: string } | ErrorResponse,
): ErrorCode => {
  if ("error" in cause) return cause.error.code;
  switch (cause._tag) {
    case "BadRequestProblem":
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
