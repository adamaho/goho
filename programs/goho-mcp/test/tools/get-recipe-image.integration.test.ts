import { layer } from "@effect/vitest";
import { RecipeImageNotFound, RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { webp } from "#test/fixtures/image.ts";
import { apiAdvice, ErrorResult, imageResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === "/recipes/5/image") {
    return HttpServerResponse.uint8Array(webp, {
      contentType: "image/webp",
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (request.url === "/recipes/999/image") {
    return yield* HttpServerRespondable.toResponse(new RecipeImageNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new RecipesUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_recipe_image", (it) => {
  it.effect("gets a saved recipe's photo as native MCP image content", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "get_recipe_image", { recipe_id: "5" })).toEqual(
        imageResult(webp, "image/webp"),
      );
      expect(yield* McpFixture.apiRequests).toEqual(["GET /recipes/5/image"]);
    }),
  );

  it.effect("reports missing photos and server failures through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "get_recipe_image", { recipe_id: "999" })).toEqual(
        toolError("Recipe 999 has no photo, or it was not found."),
      );
      expect(yield* client.call(3, "get_recipe_image", { recipe_id: "500" })).toEqual(
        toolError(`Could not get recipe image. ${apiAdvice.serverFailed}`),
      );
    }),
  );

  it.effect("rejects an invalid recipe ID without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_recipe_image", { recipe_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'get_recipe_image': /);
      expect(invalid.content[0]?.text).toContain("recipe_id");
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
