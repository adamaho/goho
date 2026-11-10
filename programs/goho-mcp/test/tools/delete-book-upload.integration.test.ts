import { layer } from "@effect/vitest";
import {
  BookUploadConflict,
  BookUploadNotFound,
  BookUploadsUnavailable,
} from "@goho/goho-server-client/book-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { failedBookUpload, succeededBookUpload } from "#test/fixtures/book-upload.ts";
import { apiAdvice, DeleteUploadResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const missingId = "11111111-2222-4333-8444-555555555555";
const unavailableId = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  switch (request.url) {
    case `/book-uploads/${failedBookUpload.id}`:
      return HttpServerResponse.empty({ status: 204 });
    case `/book-uploads/${succeededBookUpload.id}`:
      return yield* HttpServerRespondable.toResponse(new BookUploadConflict());
    case `/book-uploads/${missingId}`:
      return yield* HttpServerRespondable.toResponse(new BookUploadNotFound());
    default:
      return yield* HttpServerRespondable.toResponse(new BookUploadsUnavailable());
  }
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("delete_book_upload", (it) => {
  it.effect("deletes a failed book upload by its exact ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const deleted = yield* Schema.decodeUnknownEffect(DeleteUploadResult)(
        yield* client.call(2, "delete_book_upload", { upload_id: failedBookUpload.id }),
      );
      expect(deleted.isError).toBe(false);
      expect(deleted.structuredContent).toEqual({ deleted_upload_id: failedBookUpload.id });
      expect(yield* McpFixture.apiRequests).toEqual([
        `DELETE /book-uploads/${failedBookUpload.id}`,
      ]);
    }),
  );

  it.effect("leaves the failed-only rule to the API and reports its conflict through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(
        yield* client.call(2, "delete_book_upload", { upload_id: succeededBookUpload.id }),
      ).toEqual(toolError("Only failed book uploads can be deleted. Nothing changed."));
      // No status lookup first: the API's answer is the authority.
      expect(yield* McpFixture.apiRequests).toEqual([
        `DELETE /book-uploads/${succeededBookUpload.id}`,
      ]);
    }),
  );

  it.effect("reports missing uploads and failures when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_book_upload", { upload_id: missingId })).toEqual(
        toolError(`Book upload ${missingId} was not found.`),
      );
      expect(yield* client.call(3, "delete_book_upload", { upload_id: unavailableId })).toEqual(
        toolError(`Could not delete book upload. ${apiAdvice.serverFailed}`),
      );
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      expect(
        yield* client.call(4, "delete_book_upload", { upload_id: failedBookUpload.id }),
      ).toEqual(toolError(`Could not delete book upload. ${apiAdvice.unreachable}`));
    }),
  );

  it.effect("rejects invalid upload IDs without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // A version 1 UUID, a book ID, a number, and no ID at all.
      const invalidInputs = [
        { upload_id: "6c7d8e9f-0a1b-1c2d-be3f-4a5b6c7d8e9f" },
        { upload_id: "12" },
        { upload_id: 12 },
        {},
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "delete_book_upload", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'delete_book_upload': /,
        );
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
