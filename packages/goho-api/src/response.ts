import { Schema } from "effect";

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
