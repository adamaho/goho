import { layer } from "@effect/vitest";
import { BooksUnavailable } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { apiAdvice, BookListResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");
  return HttpServerResponse.jsonUnsafe({ data: [book] });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("list_books", (it) => {
  it.effect("lists populated, searched, and empty Goho books through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const listed = yield* Schema.decodeUnknownEffect(BookListResult)(
        yield* client.call(2, "list_books", {}),
      );
      expect(listed.isError).toBe(false);
      expect(listed.structuredContent).toEqual({ books: [book] });

      const searched = yield* Schema.decodeUnknownEffect(BookListResult)(
        yield* client.call(3, "list_books", { search: "hobbit" }),
      );
      expect(searched.structuredContent).toEqual({ books: [book] });

      yield* McpFixture.respondWith(Effect.as(routes, HttpServerResponse.jsonUnsafe({ data: [] })));
      const empty = yield* Schema.decodeUnknownEffect(BookListResult)(
        yield* client.call(4, "list_books", {}),
      );
      expect(empty.structuredContent).toEqual({ books: [] });
      expect(yield* McpFixture.apiRequests).toEqual([
        "GET /books",
        "GET /books?search=hobbit",
        "GET /books",
      ]);
    }),
  );

  it.effect("returns MCP tool errors when listing books fails", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: McpFixture.dropConnections,
          text: `Could not list books. ${apiAdvice.unreachable}`,
        },
        {
          routes: HttpServerRespondable.toResponse(new BooksUnavailable()),
          text: `Could not list books. ${apiAdvice.serverFailed}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "list_books", {})).toEqual(toolError(testCase.text));
      }
    }),
  );
});
