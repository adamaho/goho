import { layer } from "@effect/vitest";
import { BookNotFound, BooksUnavailable } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { apiAdvice, BookResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === "/books/12") {
    return HttpServerResponse.jsonUnsafe({ data: book });
  }
  if (request.url === "/books/999") {
    return yield* HttpServerRespondable.toResponse(new BookNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new BooksUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_book", (it) => {
  it.effect("gets a saved book by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const found = yield* Schema.decodeUnknownEffect(BookResult)(
        yield* client.call(2, "get_book", { book_id: "12" }),
      );
      expect(found.isError).toBe(false);
      expect(found.structuredContent).toEqual({ book });
    }),
  );

  it.effect("reports missing books and server failures through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "get_book", { book_id: "999" })).toEqual(
        toolError("Book 999 was not found."),
      );
      expect(yield* client.call(3, "get_book", { book_id: "500" })).toEqual(
        toolError(`Could not get book. ${apiAdvice.serverFailed}`),
      );
    }),
  );

  it.effect("rejects an invalid book ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_book", { book_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'get_book': /);
      expect(invalid.content[0]?.text).toContain("book_id");
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
