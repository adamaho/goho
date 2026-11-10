import { layer } from "@effect/vitest";
import {
  RecipeUploadConflict,
  RecipeUploadNotFound,
  RecipeUploadsUnavailable,
} from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { failedUpload, succeededUpload } from "#test/fixtures/recipe-upload.ts";
import {
  apiAdvice,
  DeleteRecipeUploadResult,
  ErrorResult,
  toolError,
} from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const missingId = "11111111-2222-4333-8444-555555555555";
const unavailableId = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  switch (request.url) {
    case `/recipe-uploads/${failedUpload.id}`:
      return HttpServerResponse.empty({ status: 204 });
    case `/recipe-uploads/${succeededUpload.id}`:
      return yield* HttpServerRespondable.toResponse(new RecipeUploadConflict());
    case `/recipe-uploads/${missingId}`:
      return yield* HttpServerRespondable.toResponse(new RecipeUploadNotFound());
    default:
      return yield* HttpServerRespondable.toResponse(new RecipeUploadsUnavailable());
  }
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("delete_recipe_upload", (it) => {
  it.effect("deletes a failed recipe upload by its exact ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const deleted = yield* Schema.decodeUnknownEffect(DeleteRecipeUploadResult)(
        yield* client.call(2, "delete_recipe_upload", { upload_id: failedUpload.id }),
      );
      expect(deleted.isError).toBe(false);
      expect(deleted.structuredContent).toEqual({ deleted_upload_id: failedUpload.id });
      expect(yield* McpFixture.apiRequests).toEqual([`DELETE /recipe-uploads/${failedUpload.id}`]);
    }),
  );

  it.effect("leaves the failed-only rule to the API and reports its conflict through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(
        yield* client.call(2, "delete_recipe_upload", { upload_id: succeededUpload.id }),
      ).toEqual(toolError("Only failed recipe uploads can be deleted. Nothing changed."));
      // No status lookup first: the API's answer is the authority.
      expect(yield* McpFixture.apiRequests).toEqual([
        `DELETE /recipe-uploads/${succeededUpload.id}`,
      ]);
    }),
  );

  it.effect("reports missing uploads and failures when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_recipe_upload", { upload_id: missingId })).toEqual(
        toolError(`Recipe upload ${missingId} was not found.`),
      );
      expect(yield* client.call(3, "delete_recipe_upload", { upload_id: unavailableId })).toEqual(
        toolError(`Could not delete recipe upload. ${apiAdvice.serverFailed}`),
      );
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      expect(yield* client.call(4, "delete_recipe_upload", { upload_id: failedUpload.id })).toEqual(
        toolError(`Could not delete recipe upload. ${apiAdvice.unreachable}`),
      );
    }),
  );

  it.effect("rejects invalid upload IDs without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // A version 1 UUID, a recipe ID, a number, and no ID at all.
      const invalidInputs = [
        { upload_id: "7c1e4b2a-9d3f-1a6b-8c5d-2e1f0a9b8c7d" },
        { upload_id: "5" },
        { upload_id: 5 },
        {},
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "delete_recipe_upload", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'delete_recipe_upload': /,
        );
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
