import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { DeleteBookResult, ErrorResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  if (request.url === "/books/12") {
    return HttpServerResponse.empty({ status: 204 });
  }
  if (request.url === "/books/999") {
    return HttpServerResponse.jsonUnsafe({ _tag: "BookNotFound" }, { status: 404 });
  }
  return HttpServerResponse.empty({ status: 500 });
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

      const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "delete_book", { book_id: "999" }),
      );
      expect(missing.isError).toBe(true);
      expect(missing.content[0]?.text).toContain("Book 999 was not found.");
    }),
  );

  it.effect("reports server failures when deleting a book through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "delete_book", { book_id: "7" }),
      );
      expect(failed.isError).toBe(true);
      expect(failed.content[0]?.text).toContain("Could not delete book.");
    }),
  );

  it.effect("rejects an invalid book ID when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "delete_book", { book_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'delete_book'");
    }),
  );
});
