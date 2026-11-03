import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book, createBookPayload } from "#test/fixtures/book.ts";
import { BookResult, ErrorResult } from "#test/support/mcp-client.ts";
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
        expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'create_book'");
      }
    }),
  );

  it.effect("reports an unavailable API when creating a book", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "create_book", createBookPayload),
      );
      expect(failed.isError).toBe(true);
      expect(failed.content[0]?.text).toContain("Could not create book.");
    }),
  );
});
