import { layer } from "@effect/vitest";
import { RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { recipeSummary } from "#test/fixtures/recipe.ts";
import { apiAdvice, RecipeListResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const importedSummary = {
  ...recipeSummary,
  id: "3",
  title: "apple crumble",
  source: { kind: "url", url: "https://example.com/recipes/apple-crumble" },
  totalTimeSeconds: null,
  hasImage: true,
};

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");
  expect(request.url).toBe("/recipes");
  return HttpServerResponse.jsonUnsafe({ data: [importedSummary, recipeSummary] });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("list_recipes", (it) => {
  it.effect("lists populated and empty Goho recipe headlines through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const listed = yield* Schema.decodeUnknownEffect(RecipeListResult)(
        yield* client.call(2, "list_recipes", {}),
      );
      expect(listed.isError).toBe(false);
      // Headlines stay in the API's order with their exact IDs and sources.
      expect(listed.structuredContent).toEqual({ recipes: [importedSummary, recipeSummary] });

      yield* McpFixture.respondWith(Effect.as(routes, HttpServerResponse.jsonUnsafe({ data: [] })));
      const empty = yield* Schema.decodeUnknownEffect(RecipeListResult)(
        yield* client.call(3, "list_recipes", {}),
      );
      expect(empty.structuredContent).toEqual({ recipes: [] });
      expect(yield* McpFixture.apiRequests).toEqual(["GET /recipes", "GET /recipes"]);
    }),
  );

  it.effect("returns MCP tool errors when listing recipes fails", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: McpFixture.dropConnections,
          text: `Could not list recipes. ${apiAdvice.unreachable}`,
        },
        {
          routes: HttpServerRespondable.toResponse(new RecipesUnavailable()),
          text: `Could not list recipes. ${apiAdvice.serverFailed}`,
        },
        {
          // A numeric ID could already be rounded, so it must not reach the client as a recipe.
          routes: Effect.succeed(
            HttpServerResponse.jsonUnsafe({ data: [{ ...recipeSummary, id: 5 }] }),
          ),
          text: `Could not list recipes. ${apiAdvice.incompatible}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "list_recipes", {})).toEqual(toolError(testCase.text));
      }
    }),
  );
});
