import { Schema } from "effect";
import { HttpApiError } from "effect/http-api";

/**
 * An upload went over a size or part-count limit. Receipt and book uploads share
 * this one problem because they share one upload policy.
 *
 * @category errors
 * @since 0.1.0
 */
export class UploadLimitExceeded extends HttpApiError.Problem<UploadLimitExceeded>()(
  "UploadLimitExceeded",
  { type: "goho:problem:upload-limit-exceeded", status: 413, title: "Upload limit exceeded" },
  {},
  { description: "The upload exceeds a size or part-count limit, bud. Nothing is queued." },
) {}

/**
 * Stable categories for CLI errors, bud.
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
 * Decoded public error category.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorCode = typeof ErrorCode.Type;

/**
 * CLI error code and message. Diagnostic causes stay off the roster.
 *
 * @category models
 * @since 0.1.0
 */
export const ErrorResponse = Schema.Struct({
  error: Schema.Struct({
    code: ErrorCode,
    message: Schema.String,
  }),
}).annotate({ identifier: "ErrorResponse" });

/**
 * Decoded CLI error response.
 *
 * @category models
 * @since 0.1.0
 */
export interface ErrorResponse extends Schema.Schema.Type<typeof ErrorResponse> {}

/**
 * Successful API response with its payload under `data`.
 *
 * @category models
 * @since 0.1.0
 */
export interface DataResponse<A> {
  readonly data: A;
}

/**
 * Wraps a payload schema in the shared successful response envelope, sent as
 * HTTP 200 unless the endpoint annotates another `httpApiStatus`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const DataResponse = <S extends Schema.Top>(schema: S) =>
  Schema.Struct({ data: schema }).annotate({ httpApiStatus: 200 });

/**
 * Wraps a successful payload in the shared response envelope.
 *
 * @category constructors
 * @since 0.1.0
 */
export const withData = <A>(data: A): DataResponse<A> => ({ data });
