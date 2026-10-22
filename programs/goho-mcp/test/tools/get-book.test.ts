import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { BookResult, ErrorResult, startMcpClient } from "#test/support/mcp-client.ts";

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");

    if (request.url === "/books/12") {
      return HttpServerResponse.jsonUnsafe({ data: book });
    }
    if (request.url === "/books/999") {
      return HttpServerResponse.jsonUnsafe({ _tag: "BookNotFound" }, { status: 404 });
    }
    return HttpServerResponse.empty({ status: 500 });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("gets a saved book by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const found = yield* Schema.decodeUnknownEffect(BookResult)(
      yield* client.call(2, "get_book", { book_id: "12" }),
    );
    expect(found.isError).toBe(false);
    expect(found.structuredContent).toEqual({ book });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("reports a missing book by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "get_book", { book_id: "999" }),
    );
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("Book 999 was not found.");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects an invalid book ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "get_book", { book_id: "0" }),
    );
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'get_book'");
    expect(invalid.content[0]?.text).toContain("book_id");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);
