import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Ref, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ListResult, startMcpClient } from "#test/support/mcp-client.ts";

it.effect("lists populated and empty Goho receipts through MCP", () =>
  Effect.gen(function* () {
    const receipts = yield* Ref.make([receipt]);

    const ServerLive = HttpServer.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("/receipts");
        return HttpServerResponse.jsonUnsafe({ data: yield* Ref.get(receipts) });
      }),
    ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

    yield* Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

      const listed = yield* Schema.decodeUnknownEffect(ListResult)(
        yield* client.call(2, "list_receipts", {}),
      );
      expect(listed.isError).toBe(false);
      expect(listed.structuredContent).toEqual({ receipts: [receipt] });

      yield* Ref.set(receipts, []);
      const empty = yield* Schema.decodeUnknownEffect(ListResult)(
        yield* client.call(3, "list_receipts", {}),
      );
      expect(empty.structuredContent).toEqual({ receipts: [] });
    }).pipe(Effect.provide(ServerLive));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("returns an MCP tool error when Goho server is unavailable", () =>
  Effect.gen(function* () {
    const baseUrl = yield* HttpServer.HttpServer.pipe(
      Effect.map((server) => HttpServer.formatAddress(server.address)),
      Effect.provide(NodeHttpServer.layerTest),
    );
    const client = yield* startMcpClient(baseUrl);

    const unavailable = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "list_receipts", {}),
    );
    expect(unavailable.isError).toBe(true);
    expect(unavailable.content[0]?.text).toMatch(/Could not list receipts/);
  }).pipe(Effect.provide(NodeServices.layer)),
);
