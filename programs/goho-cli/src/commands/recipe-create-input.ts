import {
  CreateRecipeRequest,
  type Fraction,
  type Ingredient,
  type MarkContent,
  type Quantity,
  RecipeUnit,
  type RecipeYield,
  type Segment,
} from "@goho/goho-server-client/recipes";
import { Effect, Option, Result, Schema } from "effect";

import { CommandError } from "#src/errors.ts";

const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const whole: Fraction = { numerator: 1, denominator: 1 };

const escapeHint = "Write commas in values as \\, and backslashes as \\\\.";
const amountHint =
  "write amounts as 2, 1/2, 0.5, or a range such as 2..3 or 1/2..3/4; write a mixed number such as 1 1/2 as 3/2, and prefix wording that starts like a number with text:";

const ingredientFormat = `Expected id=<id>,name=<text>,quantity=<amount>,unit=<unit> for a numeric amount, or id=<id>,name=<text>,quantity=<wording> without a unit. ${escapeHint}`;
const yieldFormat = `Expected quantity=<amount>,label=<text>. ${escapeHint}`;
const stepFormat =
  "Expected step text with optional marks {{ingredient=<id>}}, {{ingredient=<id>,portion=<amount>}}, or {{text=<wording>}}. Write a literal {{ as \\{{; inside a mark, write } as \\}, commas as \\, and backslashes as \\\\.";

const invalid = (flag: string, raw: string, problem: string, format: string) =>
  new CommandError({
    type: "goho:cli:invalid-input",
    detail: `Invalid --${flag} "${raw}": ${problem}. ${format}`,
  });

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

const toFraction = (value: string, numerator: bigint, denominator: bigint) => {
  if (denominator === 0n) return Result.fail(`"${value}" has a zero denominator`);
  if (numerator === 0n) return Result.fail(`"${value}" must be above zero`);
  if (numerator > maxSafeInteger || denominator > maxSafeInteger) {
    return Result.fail(
      `"${value}" needs a numerator and denominator no larger than ${Number.MAX_SAFE_INTEGER}`,
    );
  }
  return Result.succeed<Fraction>({
    numerator: Number(numerator),
    denominator: Number(denominator),
  });
};

/**
 * Exact positive number: a whole number (`2`), a fraction (`1/2`, kept as
 * written), or a decimal (`0.5`, reduced to lowest terms). Decimals convert in
 * bigint, so no digit is rounded; parts beyond safe integers fail.
 */
const parseNumber = (value: string): Result.Result<Fraction, string> => {
  if (/^\d+$/u.test(value)) return toFraction(value, BigInt(value), 1n);
  const decimal = /^(\d+)\.(\d+)$/u.exec(value);
  if (decimal !== null) {
    const [, integer = "", digits = ""] = decimal;
    const numerator = BigInt(integer + digits);
    const denominator = 10n ** BigInt(digits.length);
    const divisor = numerator === 0n ? 1n : gcd(numerator, denominator);
    return toFraction(value, numerator / divisor, denominator / divisor);
  }
  const fraction = /^(\d+)\/(\d+)$/u.exec(value);
  if (fraction !== null) {
    const [, numerator = "", denominator = ""] = fraction;
    return toFraction(value, BigInt(numerator), BigInt(denominator));
  }
  return Result.fail(`"${value}" is not a whole number, fraction, or decimal`);
};

// Anything starting with a digit, sign, or dot, or spelling a non-finite number,
// is read as a number and must parse as one; it never falls back to wording.
const looksNumeric = (value: string) =>
  /^[\d+\-.]/u.test(value) || /^(?:infinity|nan)$/iu.test(value);

/**
 * Reads a compact amount: `text:<wording>`, a number, a `min..max` range, or
 * ordinary wording such as `to taste`.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parseQuantity = (value: string): Result.Result<Quantity, string> => {
  if (value.startsWith("text:")) return Result.succeed({ kind: "text", text: value.slice(5) });
  const trimmed = value.trim();
  if (!looksNumeric(trimmed)) return Result.succeed({ kind: "text", text: value });
  const [min = "", max, ...rest] = trimmed.split("..");
  const quantity: Result.Result<Quantity, string> =
    max === undefined
      ? Result.map(parseNumber(min), (exact) => ({ kind: "exact", value: exact }))
      : rest.length > 0
        ? Result.fail(`"${trimmed}" is not a range`)
        : Result.map(Result.all([parseNumber(min), parseNumber(max)]), ([low, high]) => ({
            kind: "range",
            min: low,
            max: high,
          }));
  return Result.mapError(quantity, (problem) => `${problem}; ${amountHint}`);
};

const splitFields = (value: string) => {
  const fields: Array<string> = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index);
    const next = value.charAt(index + 1);
    if (character === "\\" && (next === "," || next === "\\")) {
      current += next;
      index += 1;
    } else if (character === ",") {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
};

// Strict on purpose: an unescaped comma fails here instead of saving a truncated value.
const readFields = (
  fields: ReadonlyArray<string>,
  keys: ReadonlyArray<string>,
  required: ReadonlyArray<string>,
): Result.Result<Map<string, string>, string> => {
  const entries = new Map<string, string>();
  for (const field of fields) {
    const separator = field.indexOf("=");
    if (separator === -1) return Result.fail(`"${field}" is not a key=value pair`);
    const key = field.slice(0, separator);
    if (!keys.includes(key)) return Result.fail(`"${key}" is not a known key`);
    if (entries.has(key)) return Result.fail(`"${key}" appears more than once`);
    entries.set(key, field.slice(separator + 1));
  }
  const missing = required.filter((key) => !entries.has(key));
  if (missing.length > 0) return Result.fail(`missing ${missing.join(", ")}`);
  return Result.succeed(entries);
};

const ingredientKeys = ["id", "name", "quantity", "unit"];
const isRecipeUnit = Schema.is(RecipeUnit);

/**
 * Reads one `--ingredient` value. Numeric amounts need a unit and wording has
 * none; IDs and names are checked when the whole recipe is decoded.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parseIngredient = (raw: string): Result.Result<Ingredient, CommandError> =>
  Result.gen(function* () {
    const fields = yield* readFields(splitFields(raw), ingredientKeys, ["id", "name", "quantity"]);
    const quantity = yield* parseQuantity(fields.get("quantity") ?? "");
    const unit = fields.get("unit");
    if (quantity.kind === "text") {
      if (unit !== undefined) return yield* Result.fail("a wording quantity takes no unit");
      return { id: fields.get("id") ?? "", name: fields.get("name") ?? "", quantity, unit: null };
    }
    if (unit === undefined) return yield* Result.fail("a numeric quantity needs a unit");
    if (!isRecipeUnit(unit)) {
      return yield* Result.fail(
        `"${unit}" is not a unit; use one of ${RecipeUnit.literals.join(", ")}`,
      );
    }
    return { id: fields.get("id") ?? "", name: fields.get("name") ?? "", quantity, unit };
  }).pipe(Result.mapError((problem) => invalid("ingredient", raw, problem, ingredientFormat)));

/**
 * Reads the `--yield` value: an amount and what it counts, with no unit.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parseYield = (raw: string): Result.Result<RecipeYield, CommandError> =>
  Result.gen(function* () {
    const fields = yield* readFields(
      splitFields(raw),
      ["quantity", "label"],
      ["quantity", "label"],
    );
    const quantity = yield* parseQuantity(fields.get("quantity") ?? "");
    return { quantity, label: fields.get("label") ?? "" };
  }).pipe(Result.mapError((problem) => invalid("yield", raw, problem, yieldFormat)));

const markContent = (fields: ReadonlyArray<string>): Result.Result<MarkContent, string> =>
  Result.gen(function* () {
    const entries = yield* readFields(fields, ["ingredient", "portion", "text"], []);
    const text = entries.get("text");
    if (text !== undefined) {
      if (entries.size > 1) return yield* Result.fail("a text mark takes only text");
      return { kind: "text", text };
    }
    const ingredientId = entries.get("ingredient");
    if (ingredientId === undefined) {
      return yield* Result.fail("a mark needs ingredient=<id> or text=<wording>");
    }
    const portion = entries.get("portion");
    if (portion === undefined) return { kind: "ingredient", ingredientId, portion: whole };
    const share = yield* parseNumber(portion.trim()).pipe(
      Result.mapError((problem) => `portion ${problem}; write it as 1/2, 0.5, or 1`),
    );
    return { kind: "ingredient", ingredientId, portion: share };
  });

const unclosed = "a mark opened with {{ is never closed with }}";

// Reads the fields of a mark that opens just before `start`, returning them
// with the index after its closing `}}`.
const readMark = (raw: string, start: number) => {
  const fields: Array<string> = [];
  let current = "";
  for (let index = start; index < raw.length; index += 1) {
    const character = raw.charAt(index);
    const next = raw.charAt(index + 1);
    if (character === "\\" && (next === "," || next === "\\" || next === "}")) {
      current += next;
      index += 1;
    } else if (character === "\\" && raw.startsWith("{{", index + 1)) {
      current += "{{";
      index += 2;
    } else if (character === "}") {
      if (next !== "}")
        return Result.fail(next === "" ? unclosed : "write a } inside a mark as \\}");
      fields.push(current);
      return Result.succeed({ fields, end: index + 2 });
    } else if (character === "{" && next === "{") {
      return Result.fail("marks cannot be nested");
    } else if (character === ",") {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  return Result.fail(unclosed);
};

/**
 * Reads one `--step` value into segments. Plain wording is kept exactly,
 * spaces included, and empty wording between marks is left out.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parseStep = (
  raw: string,
): Result.Result<{ readonly segments: ReadonlyArray<Segment> }, CommandError> =>
  Result.gen(function* () {
    const segments: Array<Segment> = [];
    let text = "";
    let index = 0;
    while (index < raw.length) {
      if (raw.startsWith("\\{{", index)) {
        text += "{{";
        index += 3;
      } else if (raw.startsWith("\\\\", index)) {
        text += "\\";
        index += 2;
      } else if (raw.startsWith("{{", index)) {
        const mark = yield* readMark(raw, index + 2);
        const content = yield* markContent(mark.fields);
        if (text !== "") segments.push({ kind: "text", text });
        segments.push({ kind: "mark", content });
        text = "";
        index = mark.end;
      } else {
        text += raw.charAt(index);
        index += 1;
      }
    }
    if (text !== "") segments.push({ kind: "text", text });
    if (segments.length === 0) return yield* Result.fail("a step needs wording or a mark");
    return { segments };
  }).pipe(Result.mapError((problem) => invalid("step", raw, problem, stepFormat)));

const parseTotalTime = (raw: string) =>
  /^\d+$/u.test(raw)
    ? Result.succeed(Number(raw))
    : Result.fail(
        new CommandError({
          type: "goho:cli:invalid-input",
          detail: `Invalid --total-time-seconds "${raw}": expected a whole number of seconds, such as 1800.`,
        }),
      );

/**
 * Raw `recipes create` flag values.
 *
 * @category models
 * @since 0.1.0
 */
export interface CreateRecipeFlags {
  readonly title: string;
  readonly ingredients: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<string>;
  readonly recipeYield: Option.Option<string>;
  readonly totalTimeSeconds: Option.Option<string>;
}

/**
 * Builds the direct recipe request from flag values and decodes it with the
 * shared schema, so ID uniqueness, mark references, ranges, portions, and
 * bounds fail before any request. Omitted yield and total time stay out of the
 * payload, meaning unknown.
 *
 * @category parsing
 * @since 0.1.0
 */
export const makeCreateRecipeRequest = Effect.fnUntraced(function* (flags: CreateRecipeFlags) {
  const ingredients = yield* Effect.fromResult(Result.all(flags.ingredients.map(parseIngredient)));
  const steps = yield* Effect.fromResult(Result.all(flags.steps.map(parseStep)));
  const recipeYield = Option.isSome(flags.recipeYield)
    ? { yield: yield* Effect.fromResult(parseYield(flags.recipeYield.value)) }
    : {};
  const totalTime = Option.isSome(flags.totalTimeSeconds)
    ? { totalTimeSeconds: yield* Effect.fromResult(parseTotalTime(flags.totalTimeSeconds.value)) }
    : {};
  return yield* Schema.decodeUnknownEffect(CreateRecipeRequest)({
    title: flags.title,
    ingredients,
    steps,
    ...recipeYield,
    ...totalTime,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new CommandError({
          type: "goho:cli:invalid-input",
          detail: `Recipe is not valid: ${cause.message}`,
        }),
    ),
  );
});
