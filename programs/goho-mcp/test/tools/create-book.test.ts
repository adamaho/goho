import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book, createBookPayload } from "#test/fixtures/book.ts";
import { BookResult, ErrorResult, startMcpClient } from "#test/support/mcp-client.ts";

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/books");
    expect(yield* request.json).toEqual(createBookPayload);
    return HttpServerResponse.jsonUnsafe({ data: book });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("creates a book through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const created = yield* Schema.decodeUnknownEffect(BookResult)(
      yield* client.call(2, "create_book", createBookPayload),
    );
    expect(created.isError).toBe(false);
    expect(created.structuredContent).toEqual({ book });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects invalid book details through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));
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
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("reports an unavailable API when creating a book", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "create_book", createBookPayload),
    );
    expect(failed.isError).toBe(true);
    expect(failed.content[0]?.text).toContain("Could not create book.");
  }).pipe(Effect.provide(NodeServices.layer)),
);
