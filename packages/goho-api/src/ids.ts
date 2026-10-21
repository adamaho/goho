import { Schema } from "effect";

/**
 * Largest PostgreSQL `bigint`.
 *
 * @category constants
 * @since 0.1.0
 */
export const maxId = 9_223_372_036_854_775_807n;

/**
 * Canonical positive decimal text within PostgreSQL `bigint` range, kept as a
 * string so clients cannot round it. Brand and annotate it per resource.
 *
 * @category models
 * @since 0.1.0
 */
export const BigintId = Schema.String.check(
  // Abort on a bad format so `BigInt` never sees non-digits, even with `errors: "all"`.
  Schema.isPattern(/^[1-9]\d{0,18}$/u).abort(),
  Schema.makeFilter((value) => BigInt(value) <= maxId, {
    expected: `an ID no greater than ${maxId}`,
    // JSON Schema has no numeric bound for strings; the description states the range.
    toJsonSchema: () => ({}),
  }),
);
