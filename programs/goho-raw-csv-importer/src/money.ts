import { DecimalString } from "@goho/goho-api/receipts";
import { BigDecimal, Option, Result, Schema } from "effect";

/**
 * Assumed tax rate for every imported receipt; the RAW export has no tax column.
 *
 * @category models
 * @since 0.1.0
 */
export const ASSUMED_TAX_RATE = BigDecimal.make(13n, 2);

// PostgreSQL numeric limits: 131072 digits before and 16383 after the point.
// Larger exponents are rejected before bigint scaling can allocate huge values.
const MAX_SCALE = 16_383;
const MAX_INTEGER_DIGITS = 131_072;

const isDecimalString = Schema.is(DecimalString);

/**
 * Parses trimmed price text that matches Goho's DecimalString contract into an
 * exact decimal. Values never pass through JavaScript numbers.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parsePrice = (text: string): Result.Result<BigDecimal.BigDecimal, string> => {
  const trimmed = text.trim();
  if (trimmed === "") return Result.fail("price is required");
  if (!isDecimalString(trimmed)) {
    return Result.fail(
      `price ${JSON.stringify(text)} is not a plain decimal such as 12.34 (no currency symbols, thousands separators, or plus signs)`,
    );
  }
  const parsed = BigDecimal.fromString(trimmed);
  if (Option.isNone(parsed)) return Result.fail(`price ${JSON.stringify(text)} is out of range`);
  const value = parsed.value;
  const digits = `${value.value < 0n ? -value.value : value.value}`.length;
  if (value.scale > MAX_SCALE || digits - value.scale > MAX_INTEGER_DIGITS) {
    return Result.fail(`price ${JSON.stringify(text)} is outside the storable numeric range`);
  }
  return Result.succeed(value);
};

const displayScale = (value: BigDecimal.BigDecimal) => Math.max(0, value.scale);

/**
 * Renders plain decimal text at the value's own scale, keeping trailing zeros
 * such as `0.10` and never using exponent notation.
 *
 * @category formatting
 * @since 0.1.0
 */
export const formatDecimal = (value: BigDecimal.BigDecimal): DecimalString => {
  const scaled = BigDecimal.scale(value, displayScale(value));
  const negative = scaled.value < 0n;
  const digits = `${negative ? -scaled.value : scaled.value}`.padStart(scaled.scale + 1, "0");
  const point = digits.length - scaled.scale;
  const plain = scaled.scale === 0 ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return DecimalString.make(negative ? `-${plain}` : plain);
};

/**
 * Calculated receipt amounts under the agreed import assumption.
 *
 * @category models
 * @since 0.1.0
 */
export interface Totals {
  readonly subtotal: DecimalString;
  readonly tax: DecimalString;
  readonly total: DecimalString;
}

/**
 * Sums item prices exactly, then calculates tax as 13% of the subtotal rounded
 * once to cents with ties away from zero. Subtotal keeps the widest item scale.
 *
 * @category calculations
 * @since 0.1.0
 */
export const calculateTotals = (prices: ReadonlyArray<BigDecimal.BigDecimal>): Totals => {
  const subtotalScale = prices.reduce((scale, price) => Math.max(scale, displayScale(price)), 0);
  const subtotal = BigDecimal.scale(BigDecimal.sumAll(prices), subtotalScale);
  const tax = BigDecimal.round(BigDecimal.multiply(subtotal, ASSUMED_TAX_RATE), {
    mode: "half-from-zero",
    scale: 2,
  });
  const total = BigDecimal.scale(BigDecimal.sum(subtotal, tax), Math.max(subtotalScale, 2));
  return {
    subtotal: formatDecimal(subtotal),
    tax: formatDecimal(BigDecimal.scale(tax, 2)),
    total: formatDecimal(total),
  };
};
