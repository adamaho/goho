import { layer } from "@effect/vitest";
import { RecipeNotFound, RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { recipe } from "#test/fixtures/recipe.ts";
import { apiAdvice, ErrorResult, RecipeResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === `/recipes/${recipe.id}`) {
    return HttpServerResponse.jsonUnsafe({ data: recipe });
  }
  if (request.url === "/recipes/43") {
    // A step mark naming no ingredient breaks the recipe, so it must not reach the client.
    return HttpServerResponse.jsonUnsafe({
      data: { ...recipe, id: "43", ingredients: recipe.ingredients.slice(1) },
    });
  }
  if (request.url === "/recipes/999") {
    return yield* HttpServerRespondable.toResponse(new RecipeNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new RecipesUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_recipe", (it) => {
  it.effect("gets a complete saved recipe by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const found = yield* Schema.decodeUnknownEffect(RecipeResult)(
        yield* client.call(2, "get_recipe", { recipe_id: recipe.id }),
      );
      expect(found.isError).toBe(false);
      expect(found.structuredContent).toEqual({ recipe });
      expect(yield* McpFixture.apiRequests).toEqual([`GET /recipes/${recipe.id}`]);
    }),
  );

  it.effect(
    "reports missing recipes, server failures, and incompatible responses through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { recipe_id: "999", text: "Recipe 999 was not found." },
          { recipe_id: "500", text: `Could not get recipe. ${apiAdvice.serverFailed}` },
          { recipe_id: "43", text: `Could not get recipe. ${apiAdvice.incompatible}` },
        ];

        for (const [index, { recipe_id, text }] of cases.entries()) {
          expect(yield* client.call(index + 2, "get_recipe", { recipe_id })).toEqual(
            toolError(text),
          );
        }
      }),
  );

  it.effect("rejects invalid recipe IDs through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // Zero, a leading zero, one past the largest bigint, and a number instead of a string.
      const invalidIds = ["0", "012", "9223372036854775808", 12];

      for (const [index, recipe_id] of invalidIds.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "get_recipe", { recipe_id }),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'get_recipe': /);
        expect(invalid.content[0]?.text).toContain("recipe_id");
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
