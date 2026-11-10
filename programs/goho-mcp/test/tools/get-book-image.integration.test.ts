import { layer } from "@effect/vitest";
import { BookImageNotFound, BooksUnavailable } from "@goho/goho-server-client/books";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { png } from "#test/fixtures/image.ts";
import { apiAdvice, ErrorResult, imageResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === "/books/12/image") {
    return HttpServerResponse.uint8Array(png, {
      contentType: "image/png",
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (request.url === "/books/999/image") {
    return yield* HttpServerRespondable.toResponse(new BookImageNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new BooksUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_book_image", (it) => {
  it.effect("gets a saved book's cover as native MCP image content", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "get_book_image", { book_id: "12" })).toEqual(
        imageResult(png, "image/png"),
      );
      expect(yield* McpFixture.apiRequests).toEqual(["GET /books/12/image"]);
    }),
  );

  it.effect("reports missing covers and server failures through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "get_book_image", { book_id: "999" })).toEqual(
        toolError("Book 999 has no cover image, or it was not found."),
      );
      expect(yield* client.call(3, "get_book_image", { book_id: "500" })).toEqual(
        toolError(`Could not get book image. ${apiAdvice.serverFailed}`),
      );
    }),
  );

  it.effect("rejects an invalid book ID without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_book_image", { book_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'get_book_image': /);
      expect(invalid.content[0]?.text).toContain("book_id");
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
