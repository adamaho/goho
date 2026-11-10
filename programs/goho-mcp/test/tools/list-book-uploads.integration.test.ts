import { layer } from "@effect/vitest";
import { BookUploadsUnavailable } from "@goho/goho-server-client/book-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import {
  failedBookUpload,
  processingBookUpload,
  queuedBookUpload,
  succeededBookUpload,
} from "#test/fixtures/book-upload.ts";
import { apiAdvice, toolError, UploadListResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

// Newest first, as the API returns them.
const uploads = [queuedBookUpload, processingBookUpload, failedBookUpload, succeededBookUpload];

const respondWithUploads = (data: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/book-uploads");
    return HttpServerResponse.jsonUnsafe({ data });
  });

layer(McpFixture.layer(respondWithUploads(uploads)), McpFixture.moduleOptions)(
  "list_book_uploads",
  (it) => {
    it.effect("lists every book upload in API order, failed ones included, through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;

        const listed = yield* Schema.decodeUnknownEffect(UploadListResult)(
          yield* client.call(2, "list_book_uploads", {}),
        );
        expect(listed.isError).toBe(false);
        expect(listed.structuredContent).toEqual({ uploads });
        expect(yield* McpFixture.apiRequests).toEqual(["GET /book-uploads"]);
      }),
    );

    it.effect("lists no book uploads through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        yield* McpFixture.respondWith(respondWithUploads([]));

        const listed = yield* Schema.decodeUnknownEffect(UploadListResult)(
          yield* client.call(2, "list_book_uploads", {}),
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
            routes: HttpServerRespondable.toResponse(new BookUploadsUnavailable()),
            text: `Could not list book uploads. ${apiAdvice.serverFailed}`,
          },
          {
            routes: respondWithUploads([{ ...queuedBookUpload, status: "paused" }]),
            text: `Could not list book uploads. ${apiAdvice.incompatible}`,
          },
          {
            routes: respondWithUploads([{ ...queuedBookUpload, contentType: "image/gif" }]),
            text: `Could not list book uploads. ${apiAdvice.incompatible}`,
          },
        ];

        for (const [index, testCase] of cases.entries()) {
          yield* McpFixture.respondWith(testCase.routes);
          expect(yield* client.call(index + 2, "list_book_uploads", {})).toEqual(
            toolError(testCase.text),
          );
        }
      }),
    );
  },
);
