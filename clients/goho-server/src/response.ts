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
 * Wraps a payload schema in the shared successful response envelope.
 *
 * @category schemas
 * @since 0.1.0
 */
export const DataResponse = <S extends Schema.Top>(schema: S) => Schema.Struct({ data: schema });

/**
 * Wraps a successful payload in the shared response envelope.
 *
 * @category constructors
 * @since 0.1.0
 */
export const withData = <A>(data: A): DataResponse<A> => ({ data });
