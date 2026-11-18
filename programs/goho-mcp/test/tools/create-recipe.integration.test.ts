import { layer } from "@effect/vitest";
import { RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import {
  createRecipeInput,
  createRecipePayload,
  recipe,
  savedRecipe,
} from "#test/fixtures/recipe.ts";
import { apiAdvice, ErrorResult, RecipeResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const [flour, milk, salt] = recipe.ingredients;

const expectPayload = (payload: unknown, data: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/recipes");
    expect(yield* request.json).toEqual(payload);
    return HttpServerResponse.jsonUnsafe({ data });
  });

const routes = expectPayload(createRecipePayload, savedRecipe);

const ToolDescriptions = Schema.Struct({
  tools: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })),
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("create_recipe", (it) => {
  it.effect(
    "exposes ingredient-mark guidance and a valid example to agents through discovery",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const discovered = yield* Schema.decodeUnknownEffect(ToolDescriptions)(
          yield* client.request(2, "tools/list", {}),
        );
        const description = discovered.tools.find(
          (tool) => tool.name === "create_recipe",
        )?.description;
        expect(description).toContain(
          "Use ingredient marks for ingredient references, not just plain text",
        );
        expect(description).toContain("ingredientId must match that id exactly");
        expect(description).toContain("1/1 means all and 1/2 means half");
        expect(description).toContain("displays the computed amount and ingredient name");
        expect(description).toContain(
          "Do not guess an unknown portion: preserve that reference as a text mark",
        );
        expect(description).toContain("does not link to an ingredient");

        const example = description?.match(
          /a step using all of it is (\{"segments":.*?\})\./u,
        )?.[1];
        expect(example).toBeDefined();
        const { steps, ...input } = {
          title: "Melted butter",
          ingredients: [{ ...flour, id: "butter", name: "butter" }],
          steps: [JSON.parse(example ?? "null")],
        };
        const payload = { ...input, sections: [{ title: null, steps }] };
        yield* McpFixture.respondWith(expectPayload(payload, { ...savedRecipe, ...payload }));
        const created = yield* Schema.decodeUnknownEffect(RecipeResult)(
          yield* client.call(3, "create_recipe", { ...input, steps }),
        );
        expect(created.isError).toBe(false);
        expect(created.structuredContent).toEqual({ recipe: { ...recipe, ...input, steps } });
        expect(yield* McpFixture.apiRequests).toEqual(["POST /recipes"]);
      }),
  );

  it.effect("creates a recipe with exact quantities and step marks through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // Titles and names are trimmed; step wording keeps its spaces. The steps
      // are saved as one untitled section.
      const input = {
        ...createRecipeInput,
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
      const steps = [{ segments: [{ kind: "text", text: "Toast the bread." }] }];
      const input = { title: "Toast", ingredients: [salt], totalTimeSeconds: null };
      const payload = { ...input, sections: [{ title: null, steps }] };
      const saved = { id: "9007199254740995", yield: null };
      yield* McpFixture.respondWith(
        expectPayload(payload, { ...savedRecipe, ...payload, ...saved }),
      );

      const created = yield* Schema.decodeUnknownEffect(RecipeResult)(
        yield* client.call(2, "create_recipe", { ...input, steps }),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({
        recipe: { ...recipe, ...input, steps, ...saved },
      });
    }),
  );

  it.effect("rejects invalid recipe details through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const withFlour = (replacement: unknown) => ({
        ...createRecipeInput,
        ingredients: [replacement, milk, salt],
      });
      const invalidInputs = [
        { ...createRecipeInput, title: "  " },
        { ...createRecipeInput, ingredients: [] },
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
        { ...createRecipeInput, ingredients: [flour, milk, { ...salt, unit: "pinch" }] },
        { ...createRecipeInput, ingredients: [flour, milk, { ...salt, id: "flour" }] },
        // The step marks flour, which this recipe no longer has.
        { ...createRecipeInput, ingredients: [milk, salt] },
        { ...createRecipeInput, totalTimeSeconds: 90.5 },
        // Saved directly, a recipe has no source or photo.
        {
          ...createRecipeInput,
          source: { kind: "url", url: "https://example.com/recipes/pancakes" },
        },
        { ...createRecipeInput, hasImage: true },
        // The tool takes flat steps, not sections.
        createRecipePayload,
        { ...createRecipeInput, steps: [] },
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
            ...savedRecipe,
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
        expect(yield* client.call(index + 2, "create_recipe", createRecipeInput)).toEqual(
          toolError(testCase.text),
        );
      }
    }),
  );
});
