import { layer } from "@effect/vitest";
import { RecipeUploadsUnavailable } from "@goho/goho-server-client/recipe-uploads";
import { Effect, Ref, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import { queuedUpload, recipeUploadUrl } from "#test/fixtures/recipe-upload.ts";
import { apiAdvice, ErrorResult, UploadResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const request = { source: { kind: "url", url: recipeUploadUrl } };

// Answers with 202 and the given upload after checking the exact request the API receives.
const expectPayload = (payload: unknown, data: unknown) =>
  Effect.gen(function* () {
    const received = yield* HttpServerRequest.HttpServerRequest;
    expect(received.method).toBe("POST");
    expect(received.url).toBe("/recipe-uploads");
    expect(yield* received.json).toEqual(payload);
    return HttpServerResponse.jsonUnsafe({ data }, { status: 202 });
  });

const routes = expectPayload(request, queuedUpload);

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("create_recipe_upload", (it) => {
  it.effect("queues a trimmed URL and returns the upload without waiting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const created = yield* Schema.decodeUnknownEffect(UploadResult)(
        yield* client.call(2, "create_recipe_upload", {
          source: { kind: "url", url: `  ${recipeUploadUrl} ` },
        }),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ upload: queuedUpload });
      // One POST and no follow-up status check.
      expect(yield* McpFixture.apiRequests).toEqual(["POST /recipe-uploads"]);
    }),
  );

  it.effect("passes local http URLs through, since the API decides what it fetches", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const local = { source: { kind: "url", url: "http://127.0.0.1:8080/pie" } };
      const upload = { ...queuedUpload, source: local.source };
      yield* McpFixture.respondWith(expectPayload(local, upload));

      const created = yield* Schema.decodeUnknownEffect(UploadResult)(
        yield* client.call(2, "create_recipe_upload", local),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ upload });
    }),
  );

  it.effect("queues a new upload each time the same URL is sent through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // The API queues every new upload, each with its own ID.
      const second = { ...queuedUpload, id: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a" };
      const uploads = yield* Ref.make([queuedUpload, second]);
      yield* McpFixture.respondWith(
        Effect.flatMap(
          Ref.modify(uploads, ([next, ...rest]) => [next, rest]),
          (next) => expectPayload(request, next),
        ),
      );

      const returned: Array<unknown> = [];
      for (const id of [2, 3]) {
        const created = yield* Schema.decodeUnknownEffect(UploadResult)(
          yield* client.call(id, "create_recipe_upload", request),
        );
        expect(created.isError).toBe(false);
        returned.push(created.structuredContent.upload);
      }
      // Two distinct uploads: nothing is deduplicated or reused on the MCP side.
      expect(returned).toEqual([queuedUpload, second]);
      expect(yield* McpFixture.apiRequests).toEqual([
        "POST /recipe-uploads",
        "POST /recipe-uploads",
      ]);
    }),
  );

  it.effect("rejects invalid recipe upload requests without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const withUrl = (url: unknown) => ({ source: { kind: "url", url } });
      const invalidInputs = [
        withUrl("ftp://example.com/recipes/pancakes"),
        withUrl("https://cook:secret@example.com/recipes/pancakes"),
        withUrl("/recipes/pancakes"),
        withUrl("   "),
        withUrl(42),
        // 2200 UTF-8 bytes, though only 1120 characters.
        withUrl(`https://example.com/${"é".repeat(1100)}`),
        { source: { kind: "url" } },
        { source: { kind: "photo", url: recipeUploadUrl } },
        {},
        // The URL belongs inside a source, and unknown fields are rejected rather than dropped.
        { url: recipeUploadUrl },
        { ...request, title: "Pancakes" },
        { source: { ...request.source, title: "Pancakes" } },
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "create_recipe_upload", input),
        );
        expect(invalid.isError, JSON.stringify(input)).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'create_recipe_upload': /,
        );
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports rejected URLs, failures, and incompatible responses through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: HttpServerRespondable.toResponse(
            new HttpApiError.BadRequestProblem({ detail: "Request validation failed" }),
          ),
          text: "The recipe URL was rejected. Check the supplied URL.",
        },
        {
          routes: HttpServerRespondable.toResponse(new RecipeUploadsUnavailable()),
          text: `Could not create recipe upload. ${apiAdvice.serverFailed}`,
        },
        {
          routes: Effect.succeed(HttpServerResponse.text("Bad gateway", { status: 502 })),
          text: `Could not create recipe upload. ${apiAdvice.serverFailed}`,
        },
        {
          routes: McpFixture.dropConnections,
          text: `Could not create recipe upload. ${apiAdvice.unreachable}`,
        },
        {
          // A succeeded upload without its recipe ID must not reach the client as a success.
          routes: expectPayload(request, { ...queuedUpload, status: "succeeded" }),
          text: `Could not create recipe upload. ${apiAdvice.incompatible}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "create_recipe_upload", request)).toEqual(
          toolError(testCase.text),
        );
      }
    }),
  );
});
