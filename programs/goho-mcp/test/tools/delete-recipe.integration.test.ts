import { layer } from "@effect/vitest";
import { RecipeNotFound, RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { recipe } from "#test/fixtures/recipe.ts";
import { apiAdvice, DeleteRecipeResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  if (request.url === `/recipes/${recipe.id}`) {
    return HttpServerResponse.empty({ status: 204 });
  }
  if (request.url === "/recipes/999") {
    return yield* HttpServerRespondable.toResponse(new RecipeNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new RecipesUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("delete_recipe", (it) => {
  it.effect("deletes a saved recipe by its exact ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const deleted = yield* Schema.decodeUnknownEffect(DeleteRecipeResult)(
        yield* client.call(2, "delete_recipe", { recipe_id: recipe.id }),
      );
      expect(deleted.isError).toBe(false);
      expect(deleted.structuredContent).toEqual({ deleted_recipe_id: recipe.id });
      expect(yield* McpFixture.apiRequests).toEqual([`DELETE /recipes/${recipe.id}`]);
    }),
  );

  it.effect("reports missing recipes and server failures when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_recipe", { recipe_id: "999" })).toEqual(
        toolError("Recipe 999 was not found."),
      );
      expect(yield* client.call(3, "delete_recipe", { recipe_id: "7" })).toEqual(
        toolError(`Could not delete recipe. ${apiAdvice.serverFailed}`),
      );
    }),
  );

  it.effect("rejects invalid recipe IDs when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // Zero, a leading zero, one past the largest bigint, and a number instead of a string.
      const invalidIds = ["0", "012", "9223372036854775808", 12];

      for (const [index, recipe_id] of invalidIds.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "delete_recipe", { recipe_id }),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'delete_recipe': /);
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
