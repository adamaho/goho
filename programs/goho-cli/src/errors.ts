import { ErrorCode } from "@goho/goho-server-client/response";
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
export const getRequestErrorCode = (cause: { readonly _tag: string }): ErrorCode => {
  switch (cause._tag) {
    case "BadRequestProblem":
    case "UploadLimitExceeded":
      return "invalid_input";
    case "ReceiptNotFound":
    case "ReceiptItemNotFound":
    case "ReceiptImageNotFound":
    case "ReceiptUploadNotFound":
    case "BookNotFound":
    case "BookImageNotFound":
    case "BookUploadNotFound":
      return "not_found";
    case "ReceiptUploadConflict":
    case "BookConflict":
    case "BookUploadConflict":
      return "conflict";
    default:
      return "request_failed";
  }
};
