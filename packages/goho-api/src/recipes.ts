import { Schema } from "effect";
import { HttpApiError } from "effect/http-api";

import { BigintId, maxId } from "./ids.ts";

const Text = Schema.Trim.check(Schema.isNonEmpty());

const maxUrlBytes = 2048;
// PostgreSQL `integer`, which stores the total time.
const maxTotalTimeSeconds = 2_147_483_647;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

// Drop the fragment and let the URL parser canonicalize the rest.
const normalize = (url: string) => {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
};

/**
 * Submitted recipe page URL, trimmed: an absolute http or https URL without a
 * username or password, of at most 2048 UTF-8 bytes, both as sent and once
 * normalized. It is checked for format
 * only; whether the page is public and reachable is decided when it is fetched.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUrl = Schema.Trim.check(
  // Abort on a bad URL so the byte check never normalizes one that doesn't parse.
  Schema.makeFilter(
    (value) => {
      const protocol = URL.parse(value)?.protocol;
      return protocol === "http:" || protocol === "https:";
    },
    {
      expected: "an absolute http or https URL",
      // WHATWG parsing accepts strings `format: "uri"` rejects; the description states the rule.
      toJsonSchema: () => [{}, true],
    },
    true,
  ),
  Schema.makeFilter(
    (value) => {
      const parsed = new URL(value);
      return parsed.username === "" && parsed.password === "";
    },
    {
      expected: "a URL without a username or password",
      toJsonSchema: () => [{}, true],
    },
  ),
  Schema.makeFilter(
    (value) => utf8Bytes(value) <= maxUrlBytes && utf8Bytes(normalize(value)) <= maxUrlBytes,
    {
      expected: `a URL no longer than ${maxUrlBytes} UTF-8 bytes, as sent and once normalized`,
      // JSON Schema counts characters, not bytes; the description states the limit.
      toJsonSchema: () => [{}, true],
    },
  ),
).pipe(Schema.brand("RecipeUrl"));

/**
 * Validated recipe page URL.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeUrl = typeof RecipeUrl.Type;

/**
 * Identity form of a recipe URL: the URL without its fragment. The parser
 * lowercases the scheme and host, drops default ports, resolves dot segments,
 * and percent-encodes; the query stays as sent. The result fits the same byte
 * limit, since decoding checked it.
 *
 * @category normalization
 * @since 0.1.0
 */
export const normalizeRecipeUrl = (url: RecipeUrl): string => normalize(url);

/**
 * Where a recipe came from. Only web page URLs suit up for now.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeSource = Schema.Struct({
  kind: Schema.tag("url"),
  url: RecipeUrl.pipe(
    Schema.annotateEncoded({
      description: `The http or https page URL as sent, trimmed, up to ${maxUrlBytes} UTF-8 bytes and without a username or password, bud; redirects don't change it.`,
      examples: ["https://example.com/recipes/pancakes"],
    }),
  ),
}).annotate({
  identifier: "RecipeSource",
  description: "The web page a recipe was pulled from.",
  examples: [{ kind: "url", url: RecipeUrl.make("https://example.com/recipes/pancakes") }],
});

/**
 * Where a recipe came from.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecipeSource extends Schema.Schema.Type<typeof RecipeSource> {}

// Safe integers pass int32, so declare int64 for generated clients; the
// safe-integer bounds stay exact.
const PositiveSafeInt = Schema.Number.check(
  Schema.isInt({
    toJsonSchema: () => ({
      type: "integer",
      format: "int64",
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
    }),
  }),
  Schema.isGreaterThan(0),
);

/**
 * Exact positive fraction of safe integers. Equivalent fractions such as `2/4`
 * and `1/2` are both accepted; a whole number has denominator `1`.
 *
 * @category models
 * @since 0.1.0
 */
export const Fraction = Schema.Struct({
  numerator: PositiveSafeInt,
  denominator: PositiveSafeInt,
}).annotate({
  identifier: "Fraction",
  description: "An exact positive fraction; 4 is 4/1 and a half is 1/2, bud.",
  examples: [
    { numerator: 1, denominator: 2 },
    { numerator: 4, denominator: 1 },
  ],
});

/**
 * Exact positive fraction.
 *
 * @category models
 * @since 0.1.0
 */
export interface Fraction extends Schema.Schema.Type<typeof Fraction> {}

// Safe-integer cross products can pass 2^53, so compare in bigint.
const compareFractions = (a: Fraction, b: Fraction) => {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
};

const whole: Fraction = { numerator: 1, denominator: 1 };

const ExactQuantity = Schema.Struct({
  kind: Schema.tag("exact"),
  value: Fraction,
}).annotate({ identifier: "ExactQuantity", description: "An exact amount." });

const RangeQuantity = Schema.Struct({
  kind: Schema.tag("range"),
  min: Fraction,
  max: Fraction,
})
  .check(
    Schema.makeFilter((range) => compareFractions(range.min, range.max) < 0, {
      expected: "a range whose min is below its max",
      toJsonSchema: () => [{}, true],
    }),
  )
  .annotate({ identifier: "RangeQuantity", description: "An amount from min up to max." });

const TextQuantity = Schema.Struct({
  kind: Schema.tag("text"),
  text: Text.pipe(
    Schema.annotateEncoded({
      description: "Source wording for an amount that isn't a number, trimmed.",
      examples: ["to taste"],
    }),
  ),
}).annotate({ identifier: "TextQuantity", description: "An amount in the source's words." });

/**
 * An amount: an exact fraction, a range with min strictly below max, or source
 * wording when the amount is not a number. Equal bounds are an exact quantity,
 * and unknown amounts stay as text, never a guessed number.
 *
 * @category models
 * @since 0.1.0
 */
export const Quantity = Schema.Union([ExactQuantity, RangeQuantity, TextQuantity]).annotate({
  identifier: "Quantity",
  description:
    "How much: an exact fraction, a range with min below max, or the source wording when it isn't a number.",
  examples: [
    { kind: "exact", value: { numerator: 1, denominator: 2 } },
    { kind: "range", min: { numerator: 2, denominator: 1 }, max: { numerator: 3, denominator: 1 } },
    { kind: "text", text: "to taste" },
  ],
});

/**
 * An amount.
 *
 * @category models
 * @since 0.1.0
 */
export type Quantity = typeof Quantity.Type;

/**
 * Units a normalized recipe uses: metric weights, metric or cup and spoon
 * volumes, and counted units. Any other unit becomes a text quantity.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUnit = Schema.Literals([
  "millilitre",
  "litre",
  "cup",
  "tablespoon",
  "teaspoon",
  "gram",
  "kilogram",
  "count",
  "clove",
  "can",
  "bunch",
  "pinch",
  "dash",
  "handful",
  "knob",
]).annotate({
  identifier: "RecipeUnit",
  description: "Unit for an exact or range quantity.",
});

/**
 * Unit a normalized recipe uses.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeUnit = typeof RecipeUnit.Type;

const IngredientId = Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()).annotate({
  description:
    "The ingredient's ID within this recipe; step marks use it to point at the ingredient.",
  examples: ["butter"],
});

/**
 * One recipe ingredient. Exact and range quantities need a unit; text
 * quantities have none.
 *
 * @category models
 * @since 0.1.0
 */
export const Ingredient = Schema.Struct({
  id: IngredientId,
  name: Text.pipe(
    Schema.annotateEncoded({
      description: "Ingredient name with any preparation or package wording, trimmed.",
      examples: ["unsalted butter, melted"],
    }),
  ),
  quantity: Quantity,
  unit: Schema.NullOr(RecipeUnit).annotate({
    description: "Unit for an exact or range quantity; null for a text quantity.",
  }),
})
  .check(
    Schema.makeFilter(
      (ingredient) =>
        (ingredient.quantity.kind === "text") === (ingredient.unit === null) ||
        "exact and range quantities need a unit; text quantities have none",
      { toJsonSchema: () => [{}, true] },
    ),
  )
  .annotate({
    identifier: "Ingredient",
    description: "One ingredient on the recipe's roster.",
    examples: [
      {
        id: "butter",
        name: "unsalted butter, melted",
        quantity: { kind: "exact", value: { numerator: 1, denominator: 4 } },
        unit: "cup",
      },
    ],
  });

/**
 * One recipe ingredient.
 *
 * @category models
 * @since 0.1.0
 */
export interface Ingredient extends Schema.Schema.Type<typeof Ingredient> {}

/**
 * What a step mark shows: literal text, or a portion of one ingredient, above
 * 0 and up to 1, that consumers compute from its quantity. Several marks can
 * share an ingredient; their portions are not added up.
 *
 * @category models
 * @since 0.1.0
 */
export const MarkContent = Schema.Union([
  Schema.Struct({
    kind: Schema.tag("text"),
    text: Schema.String.check(Schema.isPattern(/\S/u)).annotate({
      description:
        "Marked wording, kept exactly as written, such as an amount that isn't a number.",
      examples: ["a pinch"],
    }),
  }).annotate({ identifier: "TextMark", description: "Marked wording." }),
  Schema.Struct({
    kind: Schema.tag("ingredient"),
    ingredientId: IngredientId,
    portion: Fraction.annotateKey({
      description: "Share of the ingredient's quantity this step uses, up to 1/1 for all of it.",
      examples: [whole, { numerator: 1, denominator: 2 }],
    }),
  })
    .check(
      Schema.makeFilter((mark) => compareFractions(mark.portion, whole) <= 0, {
        expected: "a portion no greater than 1",
        toJsonSchema: () => [{}, true],
      }),
    )
    .annotate({ identifier: "IngredientMark", description: "Part of one ingredient." }),
]).annotate({
  identifier: "MarkContent",
  description: "What a step mark shows: marked wording or part of one ingredient.",
});

/**
 * What a step mark shows.
 *
 * @category models
 * @since 0.1.0
 */
export type MarkContent = typeof MarkContent.Type;

/**
 * One piece of a step. Text is kept exactly, spaces included, so segments join
 * without gaps or doubled spaces.
 *
 * @category models
 * @since 0.1.0
 */
export const Segment = Schema.Union([
  Schema.Struct({
    kind: Schema.tag("text"),
    text: Schema.String.check(Schema.isNonEmpty()).annotate({
      description: "Plain wording, kept exactly, including leading and trailing spaces.",
      examples: ["Melt "],
    }),
  }).annotate({ identifier: "TextSegment", description: "Plain step wording." }),
  Schema.Struct({
    kind: Schema.tag("mark"),
    content: MarkContent,
  }).annotate({ identifier: "MarkSegment", description: "A marked part of the step." }),
]).annotate({
  identifier: "Segment",
  description: "Plain wording or a mark; join the segments in order to read the step.",
});

/**
 * One piece of a step.
 *
 * @category models
 * @since 0.1.0
 */
export type Segment = typeof Segment.Type;

/**
 * One recipe step.
 *
 * @category models
 * @since 0.1.0
 */
export const Step = Schema.Struct({
  segments: Schema.NonEmptyArray(Segment).annotate({
    description: "Step wording in reading order.",
  }),
}).annotate({
  identifier: "Step",
  description: "One step of the play, in segments.",
  examples: [
    {
      segments: [
        { kind: "text", text: "Melt " },
        {
          kind: "mark",
          content: { kind: "ingredient", ingredientId: "butter", portion: whole },
        },
        { kind: "text", text: " in a pan." },
      ],
    },
  ],
});

/**
 * One recipe step.
 *
 * @category models
 * @since 0.1.0
 */
export interface Step extends Schema.Schema.Type<typeof Step> {}

/**
 * How much a recipe makes, as the source states it.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeYield = Schema.Struct({
  quantity: Quantity,
  label: Text.pipe(
    Schema.annotateEncoded({ description: "What the quantity counts.", examples: ["servings"] }),
  ),
}).annotate({
  identifier: "RecipeYield",
  description: "How much the recipe makes, as the source states it.",
  examples: [
    { quantity: { kind: "exact", value: { numerator: 4, denominator: 1 } }, label: "servings" },
  ],
});

/**
 * How much a recipe makes.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecipeYield extends Schema.Schema.Type<typeof RecipeYield> {}

// Ingredient IDs are unique within a recipe and every step mark names one of them.
const ingredientReferences = Schema.makeFilter(
  (recipe: {
    readonly ingredients: ReadonlyArray<Ingredient>;
    readonly steps: ReadonlyArray<Step>;
  }) => {
    const issues: Array<Schema.FilterIssue> = [];
    const ids = new Set<string>();
    recipe.ingredients.forEach((ingredient, index) => {
      if (ids.has(ingredient.id)) {
        issues.push({ path: ["ingredients", index, "id"], issue: "duplicate ingredient ID" });
      }
      ids.add(ingredient.id);
    });
    recipe.steps.forEach((step, stepIndex) => {
      step.segments.forEach((segment, segmentIndex) => {
        if (
          segment.kind === "mark" &&
          segment.content.kind === "ingredient" &&
          !ids.has(segment.content.ingredientId)
        ) {
          issues.push({
            path: ["steps", stepIndex, "segments", segmentIndex, "content", "ingredientId"],
            issue: "no ingredient in this recipe has this ID",
          });
        }
      });
    });
    return issues;
  },
  { toJsonSchema: () => [{}, true] },
);

const RecipeFields = {
  title: Text.pipe(
    Schema.annotateEncoded({ description: "Recipe title, trimmed.", examples: ["Pancakes"] }),
  ),
  ingredients: Schema.NonEmptyArray(Ingredient).annotate({
    description: "Ingredients in recipe order, each with an ID unique within the recipe.",
  }),
  steps: Schema.NonEmptyArray(Step).annotate({
    description: "Steps in order; ingredient marks point at this recipe's ingredients.",
  }),
  yield: Schema.NullOr(RecipeYield).annotate({
    description: "How much the recipe makes, or null when the source doesn't say.",
  }),
  totalTimeSeconds: Schema.NullOr(
    Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(maxTotalTimeSeconds),
    ),
  ).annotate({
    description: "Total time in seconds, or null when the source doesn't state one.",
    examples: [1800, null],
  }),
};

/**
 * A complete, already normalized recipe to save directly. It has no source and
 * no upload; the server adds the ID, timestamps, and `hasImage: false`.
 *
 * @category models
 * @since 0.1.0
 */
export const CreateRecipeRequest = Schema.Struct({
  title: RecipeFields.title,
  ingredients: RecipeFields.ingredients,
  steps: RecipeFields.steps,
  yield: Schema.optionalKey(RecipeFields.yield),
  totalTimeSeconds: Schema.optionalKey(RecipeFields.totalTimeSeconds),
})
  .check(ingredientReferences)
  .annotate({
    identifier: "CreateRecipeRequest",
    description:
      "A full recipe to put on the roster, bud. Leave out the yield or total time, or send null, when it isn't known.",
  });

/**
 * Decoded direct recipe creation input.
 *
 * @category models
 * @since 0.1.0
 */
export interface CreateRecipeRequest extends Schema.Schema.Type<typeof CreateRecipeRequest> {}

/**
 * Persisted recipe identity: canonical positive decimal text within PostgreSQL
 * `bigint` range, kept as a string so clients cannot round it.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeId = BigintId.annotate({
  identifier: "RecipeId",
  description: `The recipe's positive number on the roster, from 1 through ${maxId} without leading zeros, bud.`,
  examples: ["5"],
}).pipe(Schema.brand("RecipeId"));

/**
 * Decoded persisted recipe identity.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeId = typeof RecipeId.Type;

/**
 * Saved recipe without its ingredients, steps, or yield, for listings.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeSummary = Schema.Struct({
  id: RecipeId.annotateKey({
    description: "The recipe's roster number; use it to target this recipe.",
  }),
  title: RecipeFields.title,
  source: Schema.NullOr(RecipeSource).annotate({
    description: "Where the recipe was pulled from, or null when it was saved directly.",
  }),
  totalTimeSeconds: RecipeFields.totalTimeSeconds,
  hasImage: Schema.Boolean.annotate({ description: "Whether a recipe photo is on file." }),
  createdAt: Schema.String.annotate({ description: "When the recipe hit the roster." }),
  updatedAt: Schema.String.annotate({ description: "When the recipe last changed." }),
}).annotate({
  identifier: "RecipeSummary",
  description: "A saved recipe's headline details.",
});

/**
 * Saved recipe without its ingredients, steps, or yield.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecipeSummary extends Schema.Schema.Type<typeof RecipeSummary> {}

/**
 * Complete saved recipe.
 *
 * @category models
 * @since 0.1.0
 */
export const Recipe = Schema.Struct({
  ...RecipeSummary.fields,
  ingredients: RecipeFields.ingredients,
  steps: RecipeFields.steps,
  yield: RecipeFields.yield,
})
  .check(ingredientReferences)
  .annotate({
    identifier: "Recipe",
    description: "A saved recipe with its ingredients and steps.",
  });

/**
 * Complete saved recipe.
 *
 * @category models
 * @since 0.1.0
 */
export interface Recipe extends Schema.Schema.Type<typeof Recipe> {}

/**
 * No recipe has the requested ID.
 *
 * @category errors
 * @since 0.1.0
 */
export class RecipeNotFound extends HttpApiError.Problem<RecipeNotFound>()(
  "RecipeNotFound",
  { type: "goho:problem:recipe-not-found", status: 404, title: "Recipe not found" },
  {},
  { description: "No recipe is wearing that number, bud." },
) {}

/**
 * The recipe does not exist or has no photo on file.
 *
 * @category errors
 * @since 0.1.0
 */
export class RecipeImageNotFound extends HttpApiError.Problem<RecipeImageNotFound>()(
  "RecipeImageNotFound",
  { type: "goho:problem:recipe-image-not-found", status: 404, title: "Recipe image not found" },
  {},
  { description: "No photo is on file for that recipe number, bud." },
) {}

/**
 * Recipes could not be read, saved, or deleted; details stay in the server logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class RecipesUnavailable extends HttpApiError.Problem<RecipesUnavailable>()(
  "RecipesUnavailable",
  { type: "goho:problem:recipes-unavailable", status: 500, title: "Recipes unavailable" },
  {},
  { description: "The server could not get to the recipes. Nothing changed; take another shot." },
) {}
