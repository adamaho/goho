import { layer } from "@effect/vitest";
import { BookUploadNotFound, BookUploadsUnavailable } from "@goho/goho-server-client/book-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import {
  failedBookUpload,
  processingBookUpload,
  queuedBookUpload,
  succeededBookUpload,
} from "#test/fixtures/book-upload.ts";
import { apiAdvice, ErrorResult, toolError, UploadResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const uploads = [queuedBookUpload, processingBookUpload, succeededBookUpload, failedBookUpload];
const missingId = "11111111-2222-4333-8444-555555555555";
const unavailableId = "66666666-7777-4888-9999-aaaaaaaaaaaa";
// Book IDs are strings, so a number would be rounded above 2^53.
const numericBookId = {
  ...succeededBookUpload,
  id: "bbbbbbbb-cccc-4ddd-aeee-ffffffffffff",
  bookId: 42,
};
// A receipt upload failure code, which no book upload has.
const unknownFailureCode = {
  ...failedBookUpload,
  id: "cccccccc-dddd-4eee-afff-000000000000",
  failureCode: "unsupported_file_type",
};

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  const upload = [...uploads, numericBookId, unknownFailureCode].find(
    ({ id }) => request.url === `/book-uploads/${id}`,
  );
  if (upload !== undefined) {
    return HttpServerResponse.jsonUnsafe({ data: upload });
  }
  if (request.url === `/book-uploads/${missingId}`) {
    return yield* HttpServerRespondable.toResponse(new BookUploadNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new BookUploadsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_book_upload", (it) => {
  it.effect("gets a book upload in each status as a successful result through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      for (const [index, upload] of uploads.entries()) {
        const found = yield* Schema.decodeUnknownEffect(UploadResult)(
          yield* client.call(index + 2, "get_book_upload", { upload_id: upload.id }),
        );
        // A failed upload is still a successful lookup.
        expect(found.isError, upload.status).toBe(false);
        expect(found.structuredContent).toEqual({ upload });
      }
      expect(yield* McpFixture.apiRequests).toEqual(
        uploads.map(({ id }) => `GET /book-uploads/${id}`),
      );
    }),
  );

  it.effect(
    "reports missing uploads, server failures, and incompatible responses through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { upload_id: missingId, text: `Book upload ${missingId} was not found.` },
          {
            upload_id: unavailableId,
            text: `Could not get book upload. ${apiAdvice.serverFailed}`,
          },
          {
            upload_id: numericBookId.id,
            text: `Could not get book upload. ${apiAdvice.incompatible}`,
          },
          {
            upload_id: unknownFailureCode.id,
            text: `Could not get book upload. ${apiAdvice.incompatible}`,
          },
        ];

        for (const [index, { upload_id, text }] of cases.entries()) {
          expect(yield* client.call(index + 2, "get_book_upload", { upload_id })).toEqual(
            toolError(text),
          );
        }
        yield* McpFixture.respondWith(McpFixture.dropConnections);
        expect(
          yield* client.call(9, "get_book_upload", { upload_id: queuedBookUpload.id }),
        ).toEqual(toolError(`Could not get book upload. ${apiAdvice.unreachable}`));
      }),
  );

  it.effect("rejects invalid upload IDs without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // A version 1 UUID, a book ID, a number, and no ID at all.
      const invalidInputs = [
        { upload_id: "9b8a7c6d-5e4f-1a3b-8c2d-1e0f9a8b7c6d" },
        { upload_id: "12" },
        { upload_id: 12 },
        {},
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "get_book_upload", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'get_book_upload': /,
        );
        expect(invalid.content[0]?.text).toContain("upload_id");
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
