import { Effect, Option, Result } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeCreateRecipeRequest,
  parseIngredient,
  parseQuantity,
  parseSection,
  parseSectionStep,
  parseStep,
  parseYield,
} from "#src/commands/recipe-create-input.ts";

const fraction = (numerator: number, denominator: number) => ({ numerator, denominator });
const exact = (numerator: number, denominator: number) => ({
  kind: "exact",
  value: fraction(numerator, denominator),
});
const whole = fraction(1, 1);

const failure = <A, E>(result: Result.Result<A, E>) => {
  if (Result.isSuccess(result))
    throw new Error(`expected a failure, got ${String(result.success)}`);
  return result.failure;
};

const detail = <A>(
  result: Result.Result<A, { readonly type: string; readonly detail?: string }>,
) => {
  const error = failure(result);
  expect(error.type).toBe("goho:cli:invalid-input");
  return error.detail ?? "";
};

describe("parseQuantity", () => {
  it.each([
    ["2", exact(2, 1)],
    [" 2 ", exact(2, 1)],
    ["1/2", exact(1, 2)],
    ["2/4", exact(2, 4)],
    ["3/2", exact(3, 2)],
    ["0.5", exact(1, 2)],
    ["0.3", exact(3, 10)],
    ["2.50", exact(5, 2)],
    ["2.0", exact(2, 1)],
    ["0.125", exact(1, 8)],
    ["1234567.89012345", exact(24_691_357_802_469, 20_000_000)],
    ["9007199254740991", exact(Number.MAX_SAFE_INTEGER, 1)],
    ["1/9007199254740991", exact(1, Number.MAX_SAFE_INTEGER)],
    ["0.000000000000001", exact(1, 1_000_000_000_000_000)],
    ["2..3", { kind: "range", min: fraction(2, 1), max: fraction(3, 1) }],
    ["1/2..3/4", { kind: "range", min: fraction(1, 2), max: fraction(3, 4) }],
    ["0.5..1", { kind: "range", min: fraction(1, 2), max: fraction(1, 1) }],
    ["2..1", { kind: "range", min: fraction(2, 1), max: fraction(1, 1) }],
  ])("reads %j as an exact number", (value, quantity) => {
    expect(Result.getOrThrow(parseQuantity(value))).toEqual(quantity);
  });

  it.each([
    ["to taste", "to taste"],
    ["  a little  ", "  a little  "],
    ["½", "½"],
    ["text:1 or 2 handfuls", "1 or 2 handfuls"],
    ["text:2..1", "2..1"],
    ["text:Infinity", "Infinity"],
    ["text:", ""],
    [" text:2", "2"],
    ["  text: 1 or 2 ", " 1 or 2 "],
  ])("keeps %j as wording", (value, text) => {
    expect(Result.getOrThrow(parseQuantity(value))).toEqual({ kind: "text", text });
  });

  it.each([
    ["0", '"0" must be above zero'],
    ["0.0", '"0.0" must be above zero'],
    ["0/3", '"0/3" must be above zero'],
    ["1/0", '"1/0" has a zero denominator'],
    ["-1", '"-1" is not a whole number'],
    ["+2", '"+2" is not a whole number'],
    [".5", '".5" is not a whole number'],
    ["5.", '"5." is not a whole number'],
    ["1e3", '"1e3" is not a whole number'],
    ["1 1/2", '"1 1/2" is not a whole number'],
    ["1-1/2", '"1-1/2" is not a whole number'],
    ["2 cups", '"2 cups" is not a whole number'],
    ["1,5", '"1,5" is not a whole number'],
    ["Infinity", '"Infinity" is not a whole number'],
    ["-infinity", '"-infinity" is not a whole number'],
    ["NaN", '"NaN" is not a whole number'],
    ["1..", '"" is not a whole number'],
    ["..2", '"" is not a whole number'],
    ["1..2..3", '"1..2..3" is not a range'],
    ["2 .. 3", '"2 " is not a whole number'],
    ["1..0", '"0" must be above zero'],
    ["9007199254740992", "no larger than 9007199254740991"],
    ["1/9007199254740992", "no larger than 9007199254740991"],
    ["0.0000000000000001", "no larger than 9007199254740991"],
    ["123456789.123456789", "no larger than 9007199254740991"],
  ])("rejects numeric-looking %j instead of keeping it as wording", (value, problem) => {
    const error = failure(parseQuantity(value));
    expect(error).toContain(problem);
    expect(error).toContain("write a mixed number such as 1 1/2 as 3/2");
  });
});

// Fixed pseudo-random digits; their gcd with a power of ten takes many steps.
const digits = (count: number) => {
  let state = 12_345;
  let result = "";
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    result += String((state >>> 16) % 10);
  }
  return `${result}7`;
};

describe("very long decimals", () => {
  it("rejects an over-precise quantity as invalid input", () => {
    expect(failure(parseQuantity(`0.${digits(8000)}`))).toContain(
      "no larger than 9007199254740991",
    );
  });

  it("rejects an over-precise portion as invalid input", () => {
    const raw = `{{ingredient=a,portion=0.${digits(20_000)}}}`;
    expect(detail(parseStep(raw))).toContain("no larger than 9007199254740991");
  });
});

describe("parseIngredient", () => {
  it.each([
    {
      raw: "id=flour,name=Flour,quantity=2,unit=cup",
      ingredient: { id: "flour", name: "Flour", quantity: exact(2, 1), unit: "cup" },
    },
    {
      raw: "unit=gram,quantity=1/2..3/4,name=Sugar,id=sugar",
      ingredient: {
        id: "sugar",
        name: "Sugar",
        quantity: { kind: "range", min: fraction(1, 2), max: fraction(3, 4) },
        unit: "gram",
      },
    },
    {
      raw: "id=salt,name=Salt,quantity=to taste",
      ingredient: {
        id: "salt",
        name: "Salt",
        quantity: { kind: "text", text: "to taste" },
        unit: null,
      },
    },
    {
      raw: "id=herbs,name=Herbs,quantity=text:1 or 2 handfuls",
      ingredient: {
        id: "herbs",
        name: "Herbs",
        quantity: { kind: "text", text: "1 or 2 handfuls" },
        unit: null,
      },
    },
    {
      raw: "id=butter,name=Butter\\, melted,quantity=1/2,unit=cup",
      ingredient: { id: "butter", name: "Butter, melted", quantity: exact(1, 2), unit: "cup" },
    },
    {
      raw: "id=a,name=C:\\\\dir\\, x,quantity=a\\, b",
      ingredient: {
        id: "a",
        name: "C:\\dir, x",
        quantity: { kind: "text", text: "a, b" },
        unit: null,
      },
    },
    {
      raw: "id=a,name=A=B \\n,quantity=1,unit=count",
      ingredient: { id: "a", name: "A=B \\n", quantity: exact(1, 1), unit: "count" },
    },
  ])("reads $raw", ({ raw, ingredient }) => {
    expect(Result.getOrThrow(parseIngredient(raw))).toEqual(ingredient);
  });

  it.each([
    ["id=flour,name=Flour, sifted,quantity=2,unit=cup", '" sifted" is not a key=value pair'],
    ["id=flour,name=Flour,quantity=2,unit=cup,note=x", '"note" is not a known key'],
    ["id=flour,id=wheat,name=Flour,quantity=2,unit=cup", '"id" appears more than once'],
    ["name=Flour,unit=cup", "missing id, quantity"],
    ["id=salt,name=Salt,quantity=to taste,unit=pinch", "a wording quantity takes no unit"],
    ["id=salt,name=Salt,quantity=text:2,unit=pinch", "a wording quantity takes no unit"],
    ["id=flour,name=Flour,quantity=2", "a numeric quantity needs a unit"],
    ["id=flour,name=Flour,quantity=2,unit=cups", '"cups" is not a unit; use one of millilitre,'],
    ["id=flour,name=Flour,quantity=2,unit=", '"" is not a unit'],
    ["id=flour,name=Flour,quantity=1/0,unit=cup", '"1/0" has a zero denominator'],
  ])("rejects %j", (raw, problem) => {
    expect(detail(parseIngredient(raw))).toContain(`Invalid --ingredient "${raw}": ${problem}`);
  });
});

describe("parseYield", () => {
  it.each([
    ["quantity=4,label=servings", { quantity: exact(4, 1), label: "servings" }],
    [
      "label=muffins,quantity=12..16",
      { quantity: { kind: "range", min: fraction(12, 1), max: fraction(16, 1) }, label: "muffins" },
    ],
    [
      "quantity=one loaf,label=bread\\, sliced",
      { quantity: { kind: "text", text: "one loaf" }, label: "bread, sliced" },
    ],
  ])("reads %j", (raw, recipeYield) => {
    expect(Result.getOrThrow(parseYield(raw))).toEqual(recipeYield);
  });

  it.each([
    ["quantity=4,label=servings,unit=count", '"unit" is not a known key'],
    ["quantity=4", "missing label"],
    ["quantity=0,label=servings", '"0" must be above zero'],
  ])("rejects %j", (raw, problem) => {
    expect(detail(parseYield(raw))).toContain(`Invalid --yield "${raw}": ${problem}`);
  });
});

const text = (value: string) => ({ kind: "text", text: value });
const ingredientMark = (ingredientId: string, portion = whole) => ({
  kind: "mark",
  content: { kind: "ingredient", ingredientId, portion },
});
const textMark = (value: string) => ({ kind: "mark", content: { kind: "text", text: value } });

describe("parseStep", () => {
  it.each([
    ["Mix the dry ingredients.", [text("Mix the dry ingredients.")]],
    ["  Mix  well  ", [text("  Mix  well  ")]],
    [
      "Melt {{ingredient=butter}} butter.",
      [text("Melt "), ingredientMark("butter"), text(" butter.")],
    ],
    [
      "Add {{ingredient=flour,portion=1/2}} flour.",
      [text("Add "), ingredientMark("flour", fraction(1, 2)), text(" flour.")],
    ],
    ["{{portion=0.25,ingredient=flour}}", [ingredientMark("flour", fraction(1, 4))]],
    ["{{ingredient=flour,portion=1}}", [ingredientMark("flour", whole)]],
    ["{{ingredient=flour,portion=2/4}}", [ingredientMark("flour", fraction(2, 4))]],
    [
      "Season with {{text=a pinch}} of salt.",
      [text("Season with "), textMark("a pinch"), text(" of salt.")],
    ],
    ["{{text= a pinch }}", [textMark(" a pinch ")]],
    ["{{ingredient=a}}{{text=b}} and", [ingredientMark("a"), textMark("b"), text(" and")]],
    ["Add {{text=salt\\, pepper}}.", [text("Add "), textMark("salt, pepper"), text(".")]],
    ["Write \\{{example}} literally.", [text("Write {{example}} literally.")]],
    ["{{text=a \\} b}}", [textMark("a } b")]],
    ["{{text=\\{{x\\}\\}}}", [textMark("{{x}}")]],
    ["{{text=C:\\\\temp}}", [textMark("C:\\temp")]],
    ["{{text=a\\nb}}", [textMark("a\\nb")]],
    ["{{text=a}}} b", [textMark("a"), text("} b")]],
    ["Use C:\\\\temp, {not} a \\n mark }}", [text("Use C:\\temp, {not} a \\n mark }}")]],
    ["Keep \\, as written", [text("Keep \\, as written")]],
    ["Then \\\\{{text=x}}", [text("Then \\"), textMark("x")]],
  ])("reads %j", (raw, segments) => {
    expect(Result.getOrThrow(parseStep(raw))).toEqual({ segments });
  });

  it.each([
    ["", "a step needs wording or a mark"],
    ["Melt {{ingredient=butter", "a mark opened with {{ is never closed with }}"],
    ["Melt {{ingredient=butter}", "a mark opened with {{ is never closed with }}"],
    ["{{text={{x}}}}", "marks cannot be nested"],
    ["{{text=a}b}}", "write a } inside a mark as \\}"],
    ["{{}}", '"" is not a key=value pair'],
    ["{{butter}}", '"butter" is not a key=value pair'],
    ["{{amount=1}}", '"amount" is not a known key'],
    ["{{text=a,text=b}}", '"text" appears more than once'],
    ["{{text=a,ingredient=b}}", "a text mark takes only text"],
    ["{{text=a,portion=1}}", "a text mark takes only text"],
    ["{{portion=1/2}}", "a mark needs ingredient=<id> or text=<wording>"],
    ["{{ingredient=a,portion=1..2}}", 'portion "1..2" is not a whole number'],
    ["{{ingredient=a,portion=half}}", 'portion "half" is not a whole number'],
    ["{{ingredient=a,portion=0}}", 'portion "0" must be above zero'],
    ["{{ingredient=a,portion=1/0}}", 'portion "1/0" has a zero denominator'],
    ["{{text=a, b}}", '" b" is not a key=value pair'],
  ])("rejects %j", (raw, problem) => {
    expect(detail(parseStep(raw))).toContain(`Invalid --step "${raw}": ${problem}`);
  });
});

describe("parseSection", () => {
  it.each([
    ["id=batter,title=Batter", { id: "batter", title: "Batter" }],
    ["title=Batter,id=batter", { id: "batter", title: "Batter" }],
    ["id=a\\,b\\\\c,title=Mix\\, then rest", { id: "a,b\\c", title: "Mix, then rest" }],
    ["id=x,title= For the frosting ", { id: "x", title: " For the frosting " }],
    ["id=x,title=", { id: "x", title: "" }],
  ])("reads %j", (raw, section) => {
    expect(Result.getOrThrow(parseSection(raw))).toEqual(section);
  });

  it.each([
    ["id=batter", "missing title"],
    ["title=Batter", "missing id"],
    ["id=batter,title=Batter,id=b", '"id" appears more than once'],
    ["id=batter,title=Batter,steps=2", '"steps" is not a known key'],
    ["id=batter,title=Batter, mixed", '" mixed" is not a key=value pair'],
    ["id=,title=Batter", "the id is blank"],
    ["id= batter,title=Batter", "the id has surrounding spaces"],
    ["id=batter\u00a0,title=Batter", "the id has surrounding spaces"],
  ])("rejects %j", (raw, problem) => {
    expect(detail(parseSection(raw))).toContain(`Invalid --section "${raw}": ${problem}`);
  });
});

describe("parseSectionStep", () => {
  it.each([
    ["section=batter,text=Mix.", "batter", [text("Mix.")]],
    [
      "section=batter,text=Mix flour, salt, and {{ingredient=butter,portion=1/2}} butter.",
      "batter",
      [text("Mix flour, salt, and "), ingredientMark("butter", fraction(1, 2)), text(" butter.")],
    ],
    ["section=a\\,b\\\\c,text=Stir.", "a,b\\c", [text("Stir.")]],
    [
      "section=x,text=Keep text=this, section=y as wording",
      "x",
      [text("Keep text=this, section=y as wording")],
    ],
    ["section=x,text=a,title=b", "x", [text("a,title=b")]],
    ["section=x,text=C:\\\\temp \\{{x}} \\, kept", "x", [text("C:\\temp {{x}} \\, kept")]],
    ["section=x,text={{text=salt\\, pepper}}", "x", [textMark("salt, pepper")]],
  ])("reads %j", (raw, section, segments) => {
    expect(Result.getOrThrow(parseSectionStep(raw))).toEqual({ section, step: { segments } });
  });

  it.each([
    ["Mix.", "it must start with section=<id>"],
    ["text=Mix.,section=batter", "it must start with section=<id>"],
    ["note=x,section=batter,text=Mix.", "it must start with section=<id>"],
    ["section=batter", "text= must follow section=<id>"],
    ["section=batter,Mix.", "text= must follow section=<id>"],
    ["section=batter,note=x,text=Mix.", "text= must follow section=<id>"],
    ["section=a,section=b,text=Mix.", '"section" appears more than once'],
  ])("rejects %j", (raw, problem) => {
    const message = detail(parseSectionStep(raw));
    expect(message).toContain(`Invalid --step "${raw}": ${problem}`);
    expect(message).toContain("expected section=<id>,text=<step>");
  });

  it.each([
    ["section=x,text=", "a step needs wording or a mark"],
    ["section=x,text=Add {{text=salt", "a mark opened with {{ is never closed with }}"],
    ["section=x,text={{text={{x}}}}", "marks cannot be nested"],
    ["section=x,text={{text=a, b}}", '" b" is not a key=value pair'],
  ])("rejects step text in %j as a step", (raw, problem) => {
    const message = detail(parseSectionStep(raw));
    expect(message).toContain(`Invalid --step "${raw}": ${problem}`);
    expect(message).toContain("Expected step text with optional marks");
  });
});

const flags = (overrides: Partial<Parameters<typeof makeCreateRecipeRequest>[0]> = {}) => ({
  title: "Pancakes",
  ingredients: ["id=flour,name=Flour,quantity=2,unit=cup"],
  sections: [],
  steps: ["Mix {{ingredient=flour}}."],
  recipeYield: Option.none(),
  totalTimeSeconds: Option.none(),
  ...overrides,
});

const make = (overrides: Parameters<typeof flags>[0] = {}) =>
  makeCreateRecipeRequest(flags(overrides)).pipe(Effect.result, Effect.runSync);

const flourStep = { segments: [text("Mix "), ingredientMark("flour"), text(".")] };
const flour = { id: "flour", name: "Flour", quantity: exact(2, 1), unit: "cup" };

describe("makeCreateRecipeRequest", () => {
  it("builds the full request in flag order", () => {
    const request = make({
      title: "  Pancakes  ",
      ingredients: [
        "id=flour,name= Flour ,quantity=2,unit=cup",
        "id=salt,name=Salt,quantity= to taste ",
      ],
      steps: ["Mix {{ingredient=flour}} flour with salt.", "Rest."],
      recipeYield: Option.some("quantity=4,label=servings"),
      totalTimeSeconds: Option.some("1800"),
    });
    expect(Result.getOrThrow(request)).toEqual({
      title: "Pancakes",
      ingredients: [
        flour,
        { id: "salt", name: "Salt", quantity: { kind: "text", text: "to taste" }, unit: null },
      ],
      sections: [
        {
          title: null,
          steps: [
            { segments: [text("Mix "), ingredientMark("flour"), text(" flour with salt.")] },
            { segments: [text("Rest.")] },
          ],
        },
      ],
      yield: { quantity: exact(4, 1), label: "servings" },
      totalTimeSeconds: 1800,
    });
  });

  it("leaves unknown yield and total time out of the request", () => {
    const request = Result.getOrThrow(make());
    expect(request).toEqual({
      title: "Pancakes",
      ingredients: [flour],
      sections: [{ title: null, steps: [flourStep] }],
    });
  });

  it.each([
    ["section=x,text=y", [text("section=x,text=y")]],
    [" section=x,text=y", [text(" section=x,text=y")]],
    ["section=x,text={{ingredient=flour}}", [text("section=x,text="), ingredientMark("flour")]],
  ])("keeps %j as a plain step without --section", (raw, segments) => {
    const request = Result.getOrThrow(make({ steps: [raw] }));
    expect(request.sections).toEqual([{ title: null, steps: [{ segments }] }]);
  });

  it("groups steps into sections in declaration order, whatever order the steps name them", () => {
    const request = make({
      ingredients: [
        "id=flour,name=Flour,quantity=2,unit=cup",
        "id=butter,name=Butter,quantity=1/2,unit=cup",
      ],
      sections: ["id=batter,title= Batter ", "id=baking,title=Baking\\, then cooling"],
      steps: [
        "section=baking,text=Bake with {{ingredient=butter,portion=1/2}} butter.",
        "section=batter,text=Mix {{ingredient=flour}}.",
        "section=baking,text=Cool.",
        "section=batter,text=Pour, then {{ingredient=butter,portion=1/2}} on top.",
      ],
    });
    expect(Result.getOrThrow(request).sections).toEqual([
      {
        title: "Batter",
        steps: [
          flourStep,
          {
            segments: [
              text("Pour, then "),
              ingredientMark("butter", fraction(1, 2)),
              text(" on top."),
            ],
          },
        ],
      },
      {
        title: "Baking, then cooling",
        steps: [
          {
            segments: [
              text("Bake with "),
              ingredientMark("butter", fraction(1, 2)),
              text(" butter."),
            ],
          },
          { segments: [text("Cool.")] },
        ],
      },
    ]);
  });

  it("keeps the title of a lone declared section and sends no section ids", () => {
    const request = Result.getOrThrow(
      make({
        sections: ["id=only,title=Pancakes"],
        steps: ["section=only,text=Mix {{ingredient=flour}}."],
      }),
    );
    expect(request).toEqual({
      title: "Pancakes",
      ingredients: [flour],
      sections: [{ title: "Pancakes", steps: [flourStep] }],
    });
  });

  it.each([
    {
      why: "a duplicate section id",
      overrides: { sections: ["id=a,title=A", "id=a,title=B"], steps: ["section=a,text=Mix."] },
      problem: 'Invalid --section "id=a,title=B": "a" is already a section id',
    },
    {
      why: "a step naming no declared section",
      overrides: { sections: ["id=a,title=A"], steps: ["section=b,text=Mix."] },
      problem: 'Invalid --step "section=b,text=Mix.": "b" is not a --section id',
    },
    {
      why: "a plain step alongside sections",
      overrides: { sections: ["id=a,title=A"], steps: ["section=a,text=Mix.", "Rest."] },
      problem: 'Invalid --step "Rest.": it must start with section=<id>',
    },
    {
      why: "an invalid section",
      overrides: { sections: ["id=a"], steps: ["section=a,text=Mix."] },
      problem: 'Invalid --section "id=a": missing title',
    },
  ])("rejects $why", ({ overrides, problem }) => {
    expect(detail(make(overrides))).toContain(problem);
  });

  it.each([
    {
      why: "a declared section without steps",
      overrides: { sections: ["id=a,title=A", "id=b,title=B"], steps: ["section=a,text=Mix."] },
      at: '["sections"][1]["steps"]',
    },
    {
      why: "a blank section title",
      overrides: { sections: ["id=a,title= "], steps: ["section=a,text=Mix."] },
      at: '["sections"][0]["title"]',
    },
    {
      why: "an unknown mark reference in a later section",
      overrides: {
        sections: ["id=a,title=A", "id=b,title=B"],
        steps: ["section=a,text=Mix.", "section=b,text=Add {{ingredient=sugar}}."],
      },
      at: '["sections"][1]["steps"][0]["segments"][1]["content"]["ingredientId"]',
    },
  ])("rejects $why with the shared schema", ({ overrides, at }) => {
    const message = detail(make(overrides));
    expect(message).toMatch(/^Recipe is not valid: /u);
    expect(message).toContain(`at ${at}`);
  });

  it.each(["0", "2147483647", "007"])("accepts %j total seconds", (seconds) => {
    const request = Result.getOrThrow(make({ totalTimeSeconds: Option.some(seconds) }));
    expect(request.totalTimeSeconds).toBe(Number(seconds));
  });

  it.each(["-1", "1.5", "30m", "1e3", " 1", ""])("rejects %j total seconds", (seconds) => {
    expect(detail(make({ totalTimeSeconds: Option.some(seconds) }))).toBe(
      `Invalid --total-time-seconds "${seconds}": expected a whole number of seconds, such as 1800.`,
    );
  });

  it.each([
    {
      why: "too many total seconds",
      overrides: { totalTimeSeconds: Option.some("2147483648") },
      at: '["totalTimeSeconds"]',
    },
    { why: "a blank title", overrides: { title: "  " }, at: '["title"]' },
    {
      why: "a duplicate ingredient ID",
      overrides: {
        ingredients: [
          "id=flour,name=Flour,quantity=2,unit=cup",
          "id=flour,name=Rye,quantity=1,unit=cup",
        ],
      },
      at: '["ingredients"][1]["id"]',
    },
    {
      why: "an unknown mark reference",
      overrides: { steps: ["Mix {{ingredient=sugar}}."] },
      at: '["sections"][0]["steps"][0]["segments"][1]["content"]["ingredientId"]',
    },
    {
      why: "an untrimmed ingredient ID",
      overrides: { ingredients: ["id= flour,name=Flour,quantity=2,unit=cup"] },
      at: '["ingredients"][0]["id"]',
    },
    {
      why: "a blank ingredient name",
      overrides: { ingredients: ["id=flour,name= ,quantity=2,unit=cup"] },
      at: '["ingredients"][0]["name"]',
    },
    {
      why: "blank wording",
      overrides: { ingredients: ["id=flour,name=Flour,quantity=text: "] },
      at: '["ingredients"][0]["quantity"]',
    },
    {
      why: "a range whose min is not below its max",
      overrides: { ingredients: ["id=flour,name=Flour,quantity=2..2,unit=cup"] },
      at: '["ingredients"][0]["quantity"]',
    },
    {
      why: "a reversed yield range",
      overrides: { recipeYield: Option.some("quantity=3..2,label=servings") },
      at: '["yield"]["quantity"]',
    },
    {
      why: "a portion above 1",
      overrides: { steps: ["Mix {{ingredient=flour,portion=3/2}}."] },
      at: '["sections"][0]["steps"][0]["segments"][1]["content"]',
    },
    {
      why: "a blank text mark",
      overrides: { steps: ["Mix {{text= }}."] },
      at: '["sections"][0]["steps"][0]["segments"][1]["content"]',
    },
  ])("rejects $why with the shared schema", ({ overrides, at }) => {
    const message = detail(make(overrides));
    expect(message).toMatch(/^Recipe is not valid: /u);
    expect(message).toContain(`at ${at}`);
  });

  // A value after the first invalid one throws if read, so reading it fails the test.
  const unreadAfter = (values: ReadonlyArray<string>) => {
    const guarded = [...values, ""];
    Object.defineProperty(guarded, values.length, {
      get: () => {
        throw new Error("read a value after the first invalid one");
      },
    });
    return guarded;
  };

  it.each([
    {
      overrides: {
        ingredients: unreadAfter([
          "id=a,name=A,quantity=1,unit=cup",
          "id=b,name=B,quantity=-1,unit=cup",
        ]),
      },
      problem: 'Invalid --ingredient "id=b,name=B,quantity=-1,unit=cup"',
    },
    {
      overrides: { steps: unreadAfter(["Mix.", "{{text=a"]) },
      problem: 'Invalid --step "{{text=a"',
    },
    {
      overrides: {
        sections: unreadAfter(["id=a,title=A", "id=a,title=B"]),
        steps: ["section=a,text=Mix."],
      },
      problem: 'Invalid --section "id=a,title=B"',
    },
    {
      overrides: {
        sections: ["id=a,title=A"],
        steps: unreadAfter(["section=a,text=Mix.", "section=b,text=Rest."]),
      },
      problem: 'Invalid --step "section=b,text=Rest."',
    },
  ])("stops at the first invalid value: $problem", ({ overrides, problem }) => {
    expect(detail(make(overrides))).toContain(problem);
  });
});
