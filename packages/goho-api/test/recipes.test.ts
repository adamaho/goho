import { Option, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CreateRecipeRequest,
  Ingredient,
  normalizeRecipeUrl,
  Quantity,
  Recipe,
  RecipeSource,
  RecipeSummary,
  RecipeUrl,
  Step,
} from "#src/recipes.ts";

const decodes = (schema: Schema.Decoder<unknown>, value: unknown) =>
  Option.isSome(Schema.decodeUnknownOption(schema)(value));

const butter = {
  id: "butter",
  name: "unsalted butter, melted",
  quantity: { kind: "exact", value: { numerator: 1, denominator: 4 } },
  unit: "cup",
};

const melt = {
  segments: [
    { kind: "text", text: "Melt " },
    {
      kind: "mark",
      content: {
        kind: "ingredient",
        ingredientId: "butter",
        portion: { numerator: 1, denominator: 2 },
      },
    },
    { kind: "text", text: " in a pan, then add " },
    { kind: "mark", content: { kind: "text", text: "a pinch of salt" } },
    { kind: "text", text: "." },
  ],
};

const direct = { title: "Pancakes", ingredients: [butter], steps: [melt] };

const saved = {
  id: "5",
  title: "Pancakes",
  source: { kind: "url", url: "https://example.com/recipes/pancakes" },
  totalTimeSeconds: 1800,
  hasImage: false,
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:11.52+00",
  ingredients: [butter],
  steps: [melt],
  yield: {
    quantity: { kind: "exact", value: { numerator: 4, denominator: 1 } },
    label: "servings",
  },
};

describe("RecipeSource", () => {
  const source = (url: string) => ({ kind: "url", url });

  it("keeps the submitted URL, trimmed, with its query and fragment", () => {
    expect(
      Schema.decodeUnknownSync(RecipeSource)(source("  https://Example.com/a?b=1#top ")),
    ).toEqual(source("https://Example.com/a?b=1#top"));
  });

  it.each(["ftp://example.com/a", "javascript:alert(1)", "/recipes/pancakes", "example.com", ""])(
    "rejects a URL that is not absolute http or https: %j",
    (url) => {
      expect(decodes(RecipeSource, source(url))).toBe(false);
    },
  );

  it.each([
    "https://cook:secret@example.com/a",
    "https://cook@example.com/a",
    "https://:secret@example.com/a",
  ])("rejects a URL with a username or password: %j", (url) => {
    expect(decodes(RecipeSource, source(url))).toBe(false);
  });

  it("accepts an empty userinfo, which carries no credentials", () => {
    expect(decodes(RecipeSource, source("https://@example.com/a"))).toBe(true);
  });

  it("limits the submitted URL to 2048 UTF-8 bytes", () => {
    const base = "https://example.com/";
    expect(decodes(RecipeSource, source(base + "a".repeat(2048 - base.length)))).toBe(true);
    expect(decodes(RecipeSource, source(base + "a".repeat(2049 - base.length)))).toBe(false);
    // Normalizing drops the fragment, so only the submitted URL is too long.
    expect(decodes(RecipeSource, source(`${base}#${"a".repeat(2048)}`))).toBe(false);
  });

  it("limits the normalized URL to 2048 UTF-8 bytes too", () => {
    // Each `é` is 2 bytes as sent but 6 once percent-encoded.
    const url = `https://example.com/${"é".repeat(500)}`;
    expect(new TextEncoder().encode(url).byteLength).toBeLessThanOrEqual(2048);
    expect(decodes(RecipeSource, source(url))).toBe(false);
  });
});

describe("normalizeRecipeUrl", () => {
  it("drops the fragment and canonicalizes a decoded URL but keeps the query", () => {
    const url = Schema.decodeSync(RecipeUrl)(" HTTPS://Example.COM:443/a/../b?x=1&y=2#step-3 ");
    expect(normalizeRecipeUrl(url)).toBe("https://example.com/b?x=1&y=2");
  });

  it("only takes a validated URL", () => {
    expectTypeOf(normalizeRecipeUrl).parameter(0).toEqualTypeOf<RecipeUrl>();
    expectTypeOf<string>().not.toExtend<RecipeUrl>();
  });
});

describe("Quantity", () => {
  const exact = (numerator: unknown, denominator: unknown) => ({
    kind: "exact",
    value: { numerator, denominator },
  });

  it.each([
    exact(1, 0),
    exact(1, -2),
    exact(0, 1),
    exact(1.5, 2),
    exact(Number.MAX_SAFE_INTEGER + 1, 1),
    { kind: "text", text: "   " },
  ])("rejects an invalid quantity: %j", (value) => {
    expect(decodes(Quantity, value)).toBe(false);
  });

  it("orders range bounds exactly, even past 2^53 cross products", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const range = (min: [number, number], max: [number, number]) => ({
      kind: "range",
      min: { numerator: min[0], denominator: min[1] },
      max: { numerator: max[0], denominator: max[1] },
    });
    expect(decodes(Quantity, range([1, 2], [3, 4]))).toBe(true);
    expect(decodes(Quantity, range([3, 4], [1, 2]))).toBe(false);
    expect(decodes(Quantity, range([1, 2], [2, 4]))).toBe(false);
    // These differ by less than a double can see once multiplied.
    expect(decodes(Quantity, range([max - 1, max], [max - 2, max - 1]))).toBe(false);
    expect(decodes(Quantity, range([max - 2, max - 1], [max - 1, max]))).toBe(true);
  });
});

describe("Ingredient", () => {
  it.each([
    { ...butter, unit: null },
    { ...butter, quantity: { kind: "text", text: "to taste" } },
  ])("rejects a unit that doesn't match the quantity kind: %j", (value) => {
    expect(decodes(Ingredient, value)).toBe(false);
  });

  it("accepts a text quantity without a unit", () => {
    expect(
      decodes(Ingredient, { ...butter, quantity: { kind: "text", text: "a knob" }, unit: null }),
    ).toBe(true);
  });
});

describe("CreateRecipeRequest", () => {
  it("keeps step text exactly, spaces included", () => {
    const decoded = Schema.decodeUnknownSync(CreateRecipeRequest)(direct);
    expect(decoded.steps[0].segments).toEqual(melt.segments);
  });

  it("accepts a recipe without yield or total time and ignores server fields", () => {
    expect(
      Schema.decodeUnknownSync(CreateRecipeRequest)({
        ...direct,
        id: "5",
        source: { kind: "url", url: "https://example.com" },
        hasImage: true,
      }),
    ).toEqual(direct);
  });

  it("accepts null yield and total time", () => {
    expect(decodes(CreateRecipeRequest, { ...direct, yield: null, totalTimeSeconds: null })).toBe(
      true,
    );
  });

  it("rejects duplicate ingredient IDs", () => {
    expect(decodes(CreateRecipeRequest, { ...direct, ingredients: [butter, butter] })).toBe(false);
  });

  it("rejects a mark that points at no ingredient in the recipe", () => {
    const step = {
      segments: [
        {
          kind: "mark",
          content: {
            kind: "ingredient",
            ingredientId: "flour",
            portion: { numerator: 1, denominator: 1 },
          },
        },
      ],
    };
    expect(decodes(CreateRecipeRequest, { ...direct, steps: [step] })).toBe(false);
  });

  it.each([
    { numerator: 3, denominator: 2 },
    { numerator: 0, denominator: 1 },
  ])("rejects a portion outside (0, 1]: %j", (portion) => {
    const step = {
      segments: [
        { kind: "mark", content: { kind: "ingredient", ingredientId: "butter", portion } },
      ],
    };
    expect(decodes(CreateRecipeRequest, { ...direct, steps: [step] })).toBe(false);
  });

  it.each([{ segments: [] }, { segments: [{ kind: "text", text: "" }] }])(
    "rejects an empty step: %j",
    (step) => {
      expect(decodes(CreateRecipeRequest, { ...direct, steps: [step] })).toBe(false);
    },
  );
});

describe("Step", () => {
  it("keeps a whitespace separator between marks and a whole portion", () => {
    const mark = (ingredientId: string) => ({
      kind: "mark",
      content: { kind: "ingredient", ingredientId, portion: { numerator: 1, denominator: 1 } },
    });
    const step = { segments: [mark("salt"), { kind: "text", text: " " }, mark("pepper")] };
    expect(Schema.decodeUnknownSync(Step)(step)).toEqual(step);
  });
});

describe("Recipe", () => {
  it("round-trips through encoding unchanged", () => {
    expect(Schema.encodeSync(Recipe)(Schema.decodeUnknownSync(Recipe)(saved))).toEqual(saved);
  });

  it("decodes a saved recipe with a null source", () => {
    expect(decodes(Recipe, { ...saved, source: null })).toBe(true);
  });

  it("requires the nullable fields to be present", () => {
    const { yield: _yield, ...withoutYield } = saved;
    expect(decodes(Recipe, withoutYield)).toBe(false);
  });

  it("checks ingredient references", () => {
    expect(decodes(Recipe, { ...saved, ingredients: [{ ...butter, id: "oil" }] })).toBe(false);
  });

  it("decodes to a summary without the recipe content", () => {
    const summary = Schema.decodeUnknownSync(RecipeSummary)(saved);
    expect(Object.keys(summary).sort()).toEqual(
      ["createdAt", "hasImage", "id", "source", "title", "totalTimeSeconds", "updatedAt"].sort(),
    );
  });
});

describe("JSON Schema", () => {
  const { definitions } = Schema.toJsonSchemaDocument(Recipe);
  const ref = (name: string) => ({ $ref: `#/$defs/${name}` });

  it("declares fraction terms as int64 within the safe-integer range", () => {
    const term = { type: "integer", format: "int64", maximum: Number.MAX_SAFE_INTEGER };
    expect(definitions).toMatchObject({
      Fraction: { properties: { numerator: term, denominator: term } },
    });
  });

  it("names each union branch", () => {
    expect(definitions).toMatchObject({
      Quantity: { anyOf: [ref("ExactQuantity"), ref("RangeQuantity"), ref("TextQuantity")] },
      Segment: { anyOf: [ref("TextSegment"), ref("MarkSegment")] },
      MarkContent: { anyOf: [ref("TextMark"), ref("IngredientMark")] },
    });
  });

  it("refers to the shared fraction for a mark portion", () => {
    expect(definitions).toMatchObject({
      IngredientMark: { properties: { portion: { allOf: [ref("Fraction"), {}] } } },
    });
  });
});
