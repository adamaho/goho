import { layer } from "@effect/vitest";
import { BooksUnavailable } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import { book, createBookPayload } from "#test/fixtures/book.ts";
import { apiAdvice, BookResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("POST");
  expect(request.url).toBe("/books");
  expect(yield* request.json).toEqual(createBookPayload);
  return HttpServerResponse.jsonUnsafe({ data: book });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("create_book", (it) => {
  it.effect("creates a book through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const created = yield* Schema.decodeUnknownEffect(BookResult)(
        yield* client.call(2, "create_book", createBookPayload),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ book });
    }),
  );

  it.effect("rejects invalid book details through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const invalidInputs = [
        { ...createBookPayload, title: "  " },
        { author: createBookPayload.author, category: createBookPayload.category },
        { ...createBookPayload, isbn: "9780547928227" },
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "create_book", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'create_book': /);
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports rejected details, server failures, and an unavailable API through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: HttpServerRespondable.toResponse(
            new HttpApiError.BadRequestProblem({ detail: "Request validation failed" }),
          ),
          text: "The book details were rejected. Check the supplied details.",
        },
        {
          routes: HttpServerRespondable.toResponse(new BooksUnavailable()),
          text: `Could not create book. ${apiAdvice.serverFailed}`,
        },
        {
          routes: McpFixture.dropConnections,
          text: `Could not create book. ${apiAdvice.unreachable}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "create_book", createBookPayload)).toEqual(
          toolError(testCase.text),
        );
      }
    }),
  );
});
