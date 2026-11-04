import { Schema } from "effect";

import { ErrorCode } from "./errors.ts";

/**
 * Resource kinds reported by successful CLI deletion commands.
 *
 * @category models
 * @since 0.1.0
 */
export const DeletedResource = Schema.Literals([
  "book",
  "receipt",
  "book-upload",
  "receipt-upload",
]);

/**
 * Decoded CLI deletion resource kind.
 *
 * @category models
 * @since 0.1.0
 */
export type DeletedResource = typeof DeletedResource.Type;

/**
 * CLI confirmation after the server accepts a deletion. The HTTP endpoint still
 * returns an empty response; the CLI supplies this JSON result for its callers.
 *
 * @category models
 * @since 0.1.0
 */
export const DeleteResult = Schema.Struct({
  deleted: Schema.Literal(true),
  resource: DeletedResource,
  id: Schema.String,
});

/**
 * Decoded CLI deletion confirmation.
 *
 * @category models
 * @since 0.1.0
 */
export interface DeleteResult extends Schema.Schema.Type<typeof DeleteResult> {}

/**
 * Public stderr response for handled CLI failures. Diagnostic causes are kept
 * internal and never included in this response.
 *
 * @category models
 * @since 0.1.0
 */
export const ErrorResponse = Schema.Struct({
  error: Schema.Struct({
    code: ErrorCode,
    message: Schema.String,
  }),
});

/**
 * Decoded public CLI error response.
 *
 * @category models
 * @since 0.1.0
 */
export interface ErrorResponse extends Schema.Schema.Type<typeof ErrorResponse> {}
