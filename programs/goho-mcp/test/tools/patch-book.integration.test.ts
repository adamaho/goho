import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { BookResult, ErrorResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const corrections = {
  title: "The Fellowship of the Ring",
  readingLevel: "Grade 6",
};

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("PATCH");

  if (request.url === "/books/12") {
    expect(yield* request.json).toEqual(corrections);
    return HttpServerResponse.jsonUnsafe({ data: { ...book, ...corrections } });
  }
  if (request.url === "/books/13") {
    expect(yield* request.json).toEqual({ author: "Tolkien" });
    return HttpServerResponse.jsonUnsafe({ data: { ...book, id: "13", author: "Tolkien" } });
  }
  if (request.url === "/books/999") {
    return HttpServerResponse.jsonUnsafe({ _tag: "BookNotFound" }, { status: 404 });
  }
  if (request.url === "/books/409") {
    return HttpServerResponse.jsonUnsafe({ _tag: "BookConflict" }, { status: 409 });
  }
  if (request.url === "/books/400") {
    return HttpServerResponse.empty({ status: 400 });
  }
  return HttpServerResponse.empty({ status: 500 });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("patch_book", (it) => {
  it.effect("patches book details through MCP and returns the complete book", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const patched = yield* Schema.decodeUnknownEffect(BookResult)(
        yield* client.call(2, "patch_book", {
          book_id: "12",
          changes: { ...corrections, title: `  ${corrections.title}  ` },
        }),
      );
      expect(patched.isError).toBe(false);
      expect(patched.structuredContent).toEqual({ book: { ...book, ...corrections } });

      const renamed = yield* Schema.decodeUnknownEffect(BookResult)(
        yield* client.call(3, "patch_book", { book_id: "13", changes: { author: "Tolkien" } }),
      );
      expect(renamed.isError).toBe(false);
      expect(renamed.structuredContent).toEqual({
        book: { ...book, id: "13", author: "Tolkien" },
      });
    }),
  );

  it.effect(
    "reports missing books, conflicts, rejected corrections, and server failures through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { book_id: "999", message: "Book 999 was not found." },
          { book_id: "409", message: "Another saved book already has that title and author." },
          { book_id: "400", message: "The book correction was rejected." },
          { book_id: "500", message: "Could not patch book." },
        ];

        for (const [index, testCase] of cases.entries()) {
          const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
            yield* client.call(index + 2, "patch_book", {
              book_id: testCase.book_id,
              changes: { title: "The Hobbit" },
            }),
          );
          expect(failed.isError).toBe(true);
          expect(failed.content[0]?.text).toContain(testCase.message);
        }
      }),
  );

  it.effect("rejects invalid book patches before contacting the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const valid = { book_id: "12", changes: { title: "The Hobbit" } };
      const invalidInputs = [
        { ...valid, book_id: "0" },
        { ...valid, book_id: "abc" },
        { ...valid, book_id: "9223372036854775808" },
        { ...valid, book_id: 12 },
        { changes: valid.changes },
        { book_id: "12" },
        { ...valid, changes: {} },
        { ...valid, changes: null },
        { ...valid, changes: { title: "  " } },
        { ...valid, changes: { title: null } },
        { ...valid, changes: { author: "  " } },
        { ...valid, changes: { author: null } },
        { ...valid, changes: { readingLevel: null } },
        { ...valid, changes: { readingLevel: " \t" } },
        { ...valid, changes: { category: null } },
        { ...valid, changes: { title: "The Hobbit", hasImage: true } },
        { ...valid, changes: { title: "The Hobbit", id: "13" } },
        { ...valid, changes: { reading_level: "Grade 5" } },
        { ...valid, title: "The Hobbit" },
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "patch_book", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'patch_book'");
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports an unavailable API when patching a book", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "patch_book", { book_id: "12", changes: { title: "The Hobbit" } }),
      );
      expect(failed.isError).toBe(true);
      expect(failed.content[0]?.text).toContain("Could not patch book.");
    }),
  );
});
