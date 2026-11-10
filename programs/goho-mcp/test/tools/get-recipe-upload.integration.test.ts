import { layer } from "@effect/vitest";
import {
  RecipeUploadNotFound,
  RecipeUploadsUnavailable,
} from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import {
  failedUpload,
  processingUpload,
  queuedUpload,
  succeededUpload,
} from "#test/fixtures/recipe-upload.ts";
import { apiAdvice, ErrorResult, RecipeUploadResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const uploads = [queuedUpload, processingUpload, succeededUpload, failedUpload];
const missingId = "11111111-2222-4333-8444-555555555555";
const unavailableId = "66666666-7777-4888-9999-aaaaaaaaaaaa";
// A succeeded upload with no recipe ID breaks the contract, so it must not reach the client.
const contradictory = {
  ...succeededUpload,
  id: "bbbbbbbb-cccc-4ddd-aeee-ffffffffffff",
  recipeId: null,
};

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  const upload = [...uploads, contradictory].find(
    ({ id }) => request.url === `/recipe-uploads/${id}`,
  );
  if (upload !== undefined) {
    return HttpServerResponse.jsonUnsafe({ data: upload });
  }
  if (request.url === `/recipe-uploads/${missingId}`) {
    return yield* HttpServerRespondable.toResponse(new RecipeUploadNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new RecipeUploadsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_recipe_upload", (it) => {
  it.effect("gets a recipe upload in each status as a successful result through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      for (const [index, upload] of uploads.entries()) {
        const found = yield* Schema.decodeUnknownEffect(RecipeUploadResult)(
          yield* client.call(index + 2, "get_recipe_upload", { upload_id: upload.id }),
        );
        // A failed upload is still a successful lookup.
        expect(found.isError, upload.status).toBe(false);
        expect(found.structuredContent).toEqual({ upload });
      }
      expect(yield* McpFixture.apiRequests).toEqual(
        uploads.map(({ id }) => `GET /recipe-uploads/${id}`),
      );
    }),
  );

  it.effect(
    "reports missing uploads, server failures, and incompatible responses through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { upload_id: missingId, text: `Recipe upload ${missingId} was not found.` },
          {
            upload_id: unavailableId,
            text: `Could not get recipe upload. ${apiAdvice.serverFailed}`,
          },
          {
            upload_id: contradictory.id,
            text: `Could not get recipe upload. ${apiAdvice.incompatible}`,
          },
        ];

        for (const [index, { upload_id, text }] of cases.entries()) {
          expect(yield* client.call(index + 2, "get_recipe_upload", { upload_id })).toEqual(
            toolError(text),
          );
        }
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
          yield* client.call(index + 2, "get_recipe_upload", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'get_recipe_upload': /,
        );
        expect(invalid.content[0]?.text).toContain("upload_id");
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
