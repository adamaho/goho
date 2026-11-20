import { layer } from "@effect/vitest";
import { RecipesUnavailable, recipeWritingGuidance } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import { createRecipePayload, recipe, recipeSteps } from "#test/fixtures/recipe.ts";
import { apiAdvice, ErrorResult, RecipeResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const [flour, milk, salt] = recipe.ingredients;
const section = { title: null, steps: recipeSteps };

const expectPayload = (payload: unknown, data: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/recipes");
    expect(yield* request.json).toEqual(payload);
    return HttpServerResponse.jsonUnsafe({ data });
  });

const routes = expectPayload(createRecipePayload, recipe);

const ToolList = Schema.Struct({
  tools: Schema.Array(
    Schema.Struct({ name: Schema.String, description: Schema.String, inputSchema: Schema.Unknown }),
  ),
});

const Described = Schema.Struct({ description: Schema.String });

const InputSchema = Schema.Struct({
  description: Schema.String,
  properties: Schema.Struct({ sections: Described }),
  $defs: Schema.Struct({
    Ingredient: Schema.Struct({
      description: Schema.String,
      examples: Schema.Array(Schema.Unknown),
    }),
    RecipeSection: Schema.Struct({ properties: Schema.Struct({ title: Described }) }),
  }),
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("create_recipe", (it) => {
  it.effect("advertises sections, the shared writing guidance, and a valid example", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
        yield* client.request(2, "tools/list", {}),
      );
      const tool = discovered.tools.find(({ name }) => name === "create_recipe");
      const description = tool?.description ?? "";
      const inputSchema = yield* Schema.decodeUnknownEffect(InputSchema)(tool?.inputSchema);

      // The input schema is the shared request, with its descriptions intact.
      expect(inputSchema.description).toContain("Leave out the yield or total time");
      expect(inputSchema.properties.sections.description).toContain("grouped into sections");
      expect(inputSchema.$defs.RecipeSection.properties.title.description).toContain(
        "Every section needs one when the recipe has more than one",
      );
      expect(inputSchema.$defs.Ingredient.description).toBe(
        "One ingredient on the recipe's roster.",
      );
      expect(inputSchema.$defs.Ingredient.examples).toHaveLength(1);

      // The shared guidance appears word for word, and nothing asks to keep step wording.
      expect(description).toContain(recipeWritingGuidance);
      expect(description).not.toContain("as supplied");
      expect(description).toContain("ingredient marks in any section point at it");
      expect(description).toContain("ingredientId must match that id exactly");
      expect(description).toContain("1/1 means all and 1/2 means half");
      expect(description).toContain("displays the computed amount and ingredient name");
      expect(description).toContain("do not guess: write that reference as a text mark");
      expect(description).toContain("does not link to an ingredient");

      const example = description.match(
        /uses all of it has (\{"sections":.*?\})\. The portion/u,
      )?.[1];
      expect(example).toBeDefined();
      const input = {
        title: "Melted butter",
        ingredients: [{ ...flour, id: "butter", name: "butter" }],
        ...JSON.parse(example ?? "null"),
      };
      yield* McpFixture.respondWith(expectPayload(input, { ...recipe, ...input }));
      const created = yield* Schema.decodeUnknownEffect(RecipeResult)(
        yield* client.call(3, "create_recipe", input),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ recipe: { ...recipe, ...input } });
      expect(yield* McpFixture.apiRequests).toEqual(["POST /recipes"]);
    }),
  );

  it.effect("creates a recipe in two titled sections through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // Marks in either section point at the one ingredient list.
      const input = {
        ...createRecipePayload,
        sections: [
          { title: "Batter", steps: recipeSteps },
          {
            title: "To serve",
            steps: [
              {
                segments: [
                  { kind: "text", text: "Sprinkle with " },
                  {
                    kind: "mark",
                    content: {
                      kind: "ingredient",
                      ingredientId: "salt",
                      portion: { numerator: 1, denominator: 1 },
                    },
                  },
                  { kind: "text", text: "." },
                ],
              },
            ],
          },
        ],
      };
      yield* McpFixture.respondWith(expectPayload(input, { ...recipe, ...input }));

      const created = yield* Schema.decodeUnknownEffect(RecipeResult)(
        yield* client.call(2, "create_recipe", input),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ recipe: { ...recipe, ...input } });
    }),
  );

  it.effect("rejects several sections without titles before calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "create_recipe", {
          ...createRecipePayload,
          sections: [section, { title: "To serve", steps: recipeSteps }],
        }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'create_recipe': /);
      expect(invalid.content[0]?.text).toContain(
        "every section needs a title when the recipe has more than one",
      );
      expect(invalid.content[0]?.text).toContain('["sections"][0]["title"]');
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("creates a recipe with exact quantities and step marks through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // Titles and names are trimmed; step wording keeps its spaces.
      const input = {
        ...createRecipePayload,
        title: "  Pancakes ",
        ingredients: [{ ...flour, name: " all-purpose flour  " }, milk, salt],
      };

      for (const id of [2, 3]) {
        const created = yield* Schema.decodeUnknownEffect(RecipeResult)(
          yield* client.call(id, "create_recipe", input),
        );
        expect(created.isError).toBe(false);
        expect(created.structuredContent).toEqual({ recipe });
      }
      // Creation is not deduplicated: each call saves a new recipe.
      expect(yield* McpFixture.apiRequests).toEqual(["POST /recipes", "POST /recipes"]);
    }),
  );

  it.effect("creates a recipe without a known yield or total time through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const input = {
        title: "Toast",
        ingredients: [salt],
        sections: [
          { title: null, steps: [{ segments: [{ kind: "text", text: "Toast the bread." }] }] },
        ],
        totalTimeSeconds: null,
      };
      const saved = { ...recipe, ...input, id: "9007199254740995", yield: null };
      yield* McpFixture.respondWith(expectPayload(input, saved));

      const created = yield* Schema.decodeUnknownEffect(RecipeResult)(
        yield* client.call(2, "create_recipe", input),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ recipe: saved });
    }),
  );

  it.effect("rejects invalid recipe details through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const withFlour = (replacement: unknown) => ({
        ...createRecipePayload,
        ingredients: [replacement, milk, salt],
      });
      const invalidInputs = [
        { ...createRecipePayload, title: "  " },
        { ...createRecipePayload, ingredients: [] },
        { title: recipe.title, ingredients: recipe.ingredients },
        withFlour({
          ...flour,
          quantity: { kind: "exact", value: { numerator: 1, denominator: 0 } },
        }),
        withFlour({
          ...flour,
          quantity: { kind: "exact", value: { numerator: 2 ** 53, denominator: 1 } },
        }),
        withFlour({
          ...flour,
          quantity: {
            kind: "range",
            min: { numerator: 2, denominator: 1 },
            max: { numerator: 2, denominator: 1 },
          },
        }),
        // Exact amounts need a unit, and text amounts have none.
        withFlour({ ...flour, unit: null }),
        { ...createRecipePayload, ingredients: [flour, milk, { ...salt, unit: "pinch" }] },
        { ...createRecipePayload, ingredients: [flour, milk, { ...salt, id: "flour" }] },
        // The step marks flour, which this recipe no longer has.
        { ...createRecipePayload, ingredients: [milk, salt] },
        { ...createRecipePayload, totalTimeSeconds: 90.5 },
        // Saved directly, a recipe has no source or photo.
        {
          ...createRecipePayload,
          source: { kind: "url", url: "https://example.com/recipes/pancakes" },
        },
        { ...createRecipePayload, hasImage: true },
        // Steps go in sections, each with at least one step.
        { ...createRecipePayload, sections: [] },
        { ...createRecipePayload, sections: [{ title: null, steps: [] }] },
        { ...createRecipePayload, sections: [{ ...section, title: "  " }] },
        { title: recipe.title, ingredients: recipe.ingredients, steps: recipeSteps },
        // Unknown nested fields are rejected rather than silently dropped.
        withFlour({ ...flour, notes: "sifted" }),
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "create_recipe", input),
        );
        expect(invalid.isError, JSON.stringify(input)).toBe(true);
        expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'create_recipe': /);
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports rejected details, failures, and incompatible responses through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: HttpServerRespondable.toResponse(
            new HttpApiError.BadRequestProblem({ detail: "Request validation failed" }),
          ),
          text: "The recipe details were rejected. Check the supplied details.",
        },
        {
          routes: HttpServerRespondable.toResponse(new RecipesUnavailable()),
          text: `Could not create recipe. ${apiAdvice.serverFailed}`,
        },
        {
          routes: McpFixture.dropConnections,
          text: `Could not create recipe. ${apiAdvice.unreachable}`,
        },
        {
          // A saved recipe whose fraction has a zero denominator is not a recipe.
          routes: expectPayload(createRecipePayload, {
            ...recipe,
            yield: {
              ...recipe.yield,
              quantity: { kind: "exact", value: { numerator: 4, denominator: 0 } },
            },
          }),
          text: `Could not create recipe. ${apiAdvice.incompatible}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "create_recipe", createRecipePayload)).toEqual(
          toolError(testCase.text),
        );
      }
    }),
  );
});
