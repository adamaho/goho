import { layer } from "@effect/vitest";
import { RecipeUploadsUnavailable } from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import {
  failedUpload,
  processingUpload,
  queuedUpload,
  succeededUpload,
} from "#test/fixtures/recipe-upload.ts";
import { apiAdvice, UploadListResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

// Newest first, as the API returns them.
const uploads = [queuedUpload, processingUpload, failedUpload, succeededUpload];

const respondWithUploads = (data: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/recipe-uploads");
    return HttpServerResponse.jsonUnsafe({ data });
  });

layer(McpFixture.layer(respondWithUploads(uploads)), McpFixture.moduleOptions)(
  "list_recipe_uploads",
  (it) => {
    it.effect("lists every recipe upload in API order, failed ones included, through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;

        const listed = yield* Schema.decodeUnknownEffect(UploadListResult)(
          yield* client.call(2, "list_recipe_uploads", {}),
        );
        expect(listed.isError).toBe(false);
        expect(listed.structuredContent).toEqual({ uploads });
        expect(yield* McpFixture.apiRequests).toEqual(["GET /recipe-uploads"]);
      }),
    );

    it.effect("lists no recipe uploads through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        yield* McpFixture.respondWith(respondWithUploads([]));

        const listed = yield* Schema.decodeUnknownEffect(UploadListResult)(
          yield* client.call(2, "list_recipe_uploads", {}),
        );
        expect(listed.isError).toBe(false);
        expect(listed.structuredContent).toEqual({ uploads: [] });
      }),
    );

    it.effect("reports failures and incompatible responses through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          {
            routes: HttpServerRespondable.toResponse(new RecipeUploadsUnavailable()),
            text: `Could not list recipe uploads. ${apiAdvice.serverFailed}`,
          },
          {
            // A failed upload needs its failure code.
            routes: respondWithUploads([{ ...failedUpload, failureCode: null }]),
            text: `Could not list recipe uploads. ${apiAdvice.incompatible}`,
          },
        ];

        for (const [index, testCase] of cases.entries()) {
          yield* McpFixture.respondWith(testCase.routes);
          expect(yield* client.call(index + 2, "list_recipe_uploads", {})).toEqual(
            toolError(testCase.text),
          );
        }
      }),
    );
  },
);
