import { layer } from "@effect/vitest";
import { BookNotFound, BooksUnavailable } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { apiAdvice, DeleteBookResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  if (request.url === "/books/12") {
    return HttpServerResponse.empty({ status: 204 });
  }
  if (request.url === "/books/999") {
    return yield* HttpServerRespondable.toResponse(new BookNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new BooksUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("delete_book", (it) => {
  it.effect("deletes a saved book by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const deleted = yield* Schema.decodeUnknownEffect(DeleteBookResult)(
        yield* client.call(2, "delete_book", { book_id: "12" }),
      );
      expect(deleted.isError).toBe(false);
      expect(deleted.structuredContent).toEqual({ deleted_book_id: "12" });
    }),
  );

  it.effect("reports a missing book when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_book", { book_id: "999" })).toEqual(
        toolError("Book 999 was not found."),
      );
    }),
  );

  it.effect("reports server failures when deleting a book through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_book", { book_id: "7" })).toEqual(
        toolError(`Could not delete book. ${apiAdvice.serverFailed}`),
      );
    }),
  );

  it.effect("rejects an invalid book ID when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "delete_book", { book_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'delete_book': /);
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
