import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Ref, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { book } from "#test/fixtures/book.ts";
import { BookListResult, ErrorResult, startMcpClient } from "#test/support/mcp-client.ts";

it.effect("lists populated, searched, and empty Goho books through MCP", () =>
  Effect.gen(function* () {
    const books = yield* Ref.make([book]);
    const urls = yield* Ref.make<ReadonlyArray<string>>([]);

    const ServerLive = HttpServer.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("GET");
        yield* Ref.update(urls, (seen) => [...seen, request.url]);
        return HttpServerResponse.jsonUnsafe({ data: yield* Ref.get(books) });
      }),
    ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

    yield* Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

      const listed = yield* Schema.decodeUnknownEffect(BookListResult)(
        yield* client.call(2, "list_books", {}),
      );
      expect(listed.isError).toBe(false);
      expect(listed.structuredContent).toEqual({ books: [book] });

      const searched = yield* Schema.decodeUnknownEffect(BookListResult)(
        yield* client.call(3, "list_books", { search: "hobbit" }),
      );
      expect(searched.structuredContent).toEqual({ books: [book] });

      yield* Ref.set(books, []);
      const empty = yield* Schema.decodeUnknownEffect(BookListResult)(
        yield* client.call(4, "list_books", {}),
      );
      expect(empty.structuredContent).toEqual({ books: [] });
      expect(yield* Ref.get(urls)).toEqual(["/books", "/books?search=hobbit", "/books"]);
    }).pipe(Effect.provide(ServerLive));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("returns an MCP tool error when listing books and Goho server is unavailable", () =>
  Effect.gen(function* () {
    const baseUrl = yield* HttpServer.HttpServer.pipe(
      Effect.map((server) => HttpServer.formatAddress(server.address)),
      Effect.provide(NodeHttpServer.layerTest),
    );
    const client = yield* startMcpClient(baseUrl);

    const unavailable = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "list_books", {}),
    );
    expect(unavailable.isError).toBe(true);
    expect(unavailable.content[0]?.text).toMatch(/Could not list books/);
  }).pipe(Effect.provide(NodeServices.layer)),
);
