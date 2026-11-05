import { layer } from "@effect/vitest";
import { BookNotFound } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { BookResult, ErrorResult } from "#test/support/mcp-client.ts";
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
  return HttpServerResponse.empty({ status: 500 });
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

  it.effect("reports a missing book by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_book", { book_id: "999" }),
      );
      expect(missing.isError).toBe(true);
      expect(missing.content[0]?.text).toContain("Book 999 was not found.");
    }),
  );

  it.effect("rejects an invalid book ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_book", { book_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'get_book'");
      expect(invalid.content[0]?.text).toContain("book_id");
    }),
  );
});
