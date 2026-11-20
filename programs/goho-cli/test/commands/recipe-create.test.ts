import { RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  runCommand,
  serverProblemOutput,
  toTestResponse,
  validationProblem,
  withResponse,
} from "#test/cli.ts";

const consumerExample = [
  "--title",
  "Pancakes",
  "--ingredient",
  "id=flour,name=Flour,quantity=2,unit=cup",
  "--ingredient",
  "id=salt,name=Salt,quantity=to taste",
  "--step",
  "Mix {{ingredient=flour}} flour with salt.",
  "--yield",
  "quantity=4,label=servings",
  "--total-time-seconds",
  "1800",
];

const flour = {
  id: "flour",
  name: "Flour",
  quantity: { kind: "exact", value: { numerator: 2, denominator: 1 } },
  unit: "cup",
};
const step = {
  segments: [
    { kind: "text", text: "Mix " },
    {
      kind: "mark",
      content: {
        kind: "ingredient",
        ingredientId: "flour",
        portion: { numerator: 1, denominator: 1 },
      },
    },
    { kind: "text", text: " flour with salt." },
  ],
};

const payload = {
  title: "Pancakes",
  ingredients: [
    flour,
    { id: "salt", name: "Salt", quantity: { kind: "text", text: "to taste" }, unit: null },
  ],
  sections: [{ title: null, steps: [step] }],
  yield: {
    quantity: { kind: "exact", value: { numerator: 4, denominator: 1 } },
    label: "servings",
  },
  totalTimeSeconds: 1800,
};

const recipe = {
  id: "9223372036854775807",
  title: "Pancakes",
  source: null,
  totalTimeSeconds: 1800,
  hasImage: false,
  createdAt: "2026-11-10 08:00:00+00",
  updatedAt: "2026-11-10 08:00:00+00",
  ingredients: payload.ingredients,
  sections: payload.sections,
  yield: payload.yield,
};

const runCreate = (args: ReadonlyArray<string>, expected: unknown, status: number, body: unknown) =>
  withResponse(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/recipes");
      expect(request.headers["content-type"]).toBe("application/json");
      expect(yield* request.json.pipe(Effect.orDie)).toEqual(expected);
      return yield* toTestResponse(status, body);
    }),
    (baseUrl) => runCommand(baseUrl, ["recipes", "create", ...args]),
  );

describe("recipes create", () => {
  it("sends the recipe and prints the saved one as sent", async () => {
    const result = await runCreate(consumerExample, payload, 200, { data: recipe });
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(recipe, null, 2)}\n`,
    });
  });

  it("leaves out unknown yield and total time", async () => {
    const saved = { ...recipe, id: "7", ingredients: [flour], yield: null, totalTimeSeconds: null };
    const result = await runCreate(
      [
        "--title",
        "Pancakes",
        "--ingredient",
        "id=flour,name=Flour,quantity=2,unit=cup",
        "--step",
        "Mix {{ingredient=flour}} flour with salt.",
      ],
      { title: "Pancakes", ingredients: [flour], sections: [{ title: null, steps: [step] }] },
      200,
      { data: saved },
    );
    expect(result).toEqual({ code: 0, stderr: "", stdout: `${JSON.stringify(saved, null, 2)}\n` });
  });

  it("sends titled sections in declaration order without their local ids", async () => {
    const mix = { segments: [{ kind: "text", text: "Mix, then rest." }] };
    const sections = [
      { title: "Batter", steps: [step, mix] },
      {
        title: "Baking",
        steps: [{ segments: [{ kind: "text", text: "Bake, text=until done." }] }],
      },
    ];
    const saved = { ...recipe, sections };
    // Steps come before and between the sections they name; flag order does not matter.
    const result = await runCreate(
      [
        "--step",
        "section=baking,text=Bake, text=until done.",
        "--title",
        "Pancakes",
        "--step",
        "section=batter,text=Mix {{ingredient=flour}} flour with salt.",
        "--section",
        "id=batter,title=Batter",
        "--ingredient",
        "id=flour,name=Flour,quantity=2,unit=cup",
        "--step",
        "section=batter,text=Mix, then rest.",
        "--section",
        "id=baking,title=Baking",
        "--ingredient",
        "id=salt,name=Salt,quantity=to taste",
        "--yield",
        "quantity=4,label=servings",
        "--total-time-seconds",
        "1800",
      ],
      { ...payload, sections },
      200,
      { data: saved },
    );
    expect(result).toEqual({ code: 0, stderr: "", stdout: `${JSON.stringify(saved, null, 2)}\n` });
  });

  it.each([
    { status: 400, problem: validationProblem },
    { status: 500, problem: new RecipesUnavailable() },
  ] as const)("reports HTTP $status and exits nonzero", async ({ status, problem }) => {
    const result = await runCreate(consumerExample, payload, status, problem);
    expect(result).toEqual({ code: 1, stdout: "", stderr: serverProblemOutput(problem) });
  });
});

describe("recipe create validation", () => {
  const withoutFlag = (flag: string) =>
    consumerExample.filter((arg, index) => arg !== flag && consumerExample[index - 1] !== flag);

  it.each([
    { why: "no title", args: withoutFlag("--title"), detail: "Missing required flag: --title" },
    {
      why: "no ingredient",
      args: withoutFlag("--ingredient"),
      detail: "Missing required flag: --ingredient",
    },
    { why: "no step", args: withoutFlag("--step"), detail: "Missing required flag: --step" },
    {
      why: "a numeric-looking quantity",
      args: [...consumerExample, "--ingredient", "id=egg,name=Egg,quantity=1 1/2,unit=count"],
      detail:
        'Invalid --ingredient "id=egg,name=Egg,quantity=1 1/2,unit=count": "1 1/2" is not a whole number',
    },
    {
      why: "an unknown mark reference",
      args: [...consumerExample, "--step", "Add {{ingredient=sugar}}."],
      detail:
        'Recipe is not valid: no ingredient in this recipe has this ID\n  at ["sections"][0]["steps"][1]["segments"][1]["content"]["ingredientId"]',
    },
    {
      why: "an unclosed mark",
      args: [...consumerExample, "--step", "Add {{text=salt"],
      detail: 'Invalid --step "Add {{text=salt": a mark opened with {{ is never closed with }}',
    },
    {
      why: "a step without a section when sections are declared",
      args: [...consumerExample, "--section", "id=batter,title=Batter"],
      detail:
        'Invalid --step "Mix {{ingredient=flour}} flour with salt.": it must start with section=<id>',
    },
    {
      why: "a step naming an undeclared section",
      args: [
        ...withoutFlag("--step"),
        "--section",
        "id=batter,title=Batter",
        "--step",
        "section=baking,text=Bake.",
      ],
      detail: 'Invalid --step "section=baking,text=Bake.": "baking" is not a --section id',
    },
  ])("rejects $why before sending a request", async ({ args, detail }) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.jsonUnsafe({ data: recipe });
      }),
      (baseUrl) => runCommand(baseUrl, ["recipes", "create", ...args]),
    );
    expect(requests).toBe(0);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      type: "goho:cli:invalid-input",
      title: "Invalid command input",
      detail: expect.stringContaining(detail),
    });
  });

  it("documents sections and section steps in its help, even with a bad server URL", async () => {
    const result = await runCommand("not a url", ["recipes", "create", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--section string");
    expect(result.stdout).toContain("id=<id>,title=<text>");
    expect(result.stdout).toContain("With --section, write every step as section=<id>,text=<step>");
  });
});
