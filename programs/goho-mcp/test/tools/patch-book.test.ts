import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { BookResult, ErrorResult, startMcpClient } from "#test/support/mcp-client.ts";

const corrections = {
  title: "The Fellowship of the Ring",
  readingLevel: "Grade 6",
};

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("PATCH");

    if (request.url === "/books/12") {
      expect(yield* request.json).toEqual(corrections);
      return HttpServerResponse.jsonUnsafe({ data: { ...book, ...corrections } });
    }
    if (request.url === "/books/13") {
      expect(yield* request.json).toEqual({ readingLevel: null });
      return HttpServerResponse.jsonUnsafe({ data: { ...book, id: "13", readingLevel: null } });
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
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("patches book details through MCP and returns the complete book", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const patched = yield* Schema.decodeUnknownEffect(BookResult)(
      yield* client.call(2, "patch_book", {
        book_id: "12",
        changes: { ...corrections, title: `  ${corrections.title}  ` },
      }),
    );
    expect(patched.isError).toBe(false);
    expect(patched.structuredContent).toEqual({ book: { ...book, ...corrections } });

    const cleared = yield* Schema.decodeUnknownEffect(BookResult)(
      yield* client.call(3, "patch_book", { book_id: "13", changes: { readingLevel: null } }),
    );
    expect(cleared.isError).toBe(false);
    expect(cleared.structuredContent).toEqual({
      book: { ...book, id: "13", readingLevel: null },
    });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect(
  "reports missing books, conflicts, rejected corrections, and server failures through MCP",
  () =>
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const client = yield* startMcpClient(HttpServer.formatAddress(server.address));
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
    }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects invalid book patches before contacting the API", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
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
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("reports an unavailable API when patching a book", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "patch_book", { book_id: "12", changes: { title: "The Hobbit" } }),
    );
    expect(failed.isError).toBe(true);
    expect(failed.content[0]?.text).toContain("Could not patch book.");
  }).pipe(Effect.provide(NodeServices.layer)),
);
