import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { expect } from "vitest";

import { createPayload, receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ReceiptResult, startMcpClient } from "#test/support/mcp-client.ts";

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/receipts");
    expect(request.headers["idempotency-key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(yield* request.json).toEqual(createPayload);
    return HttpServerResponse.jsonUnsafe({ data: receipt });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("creates a receipt with a generated idempotency key through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const created = yield* Schema.decodeUnknownEffect(ReceiptResult)(
      yield* client.call(2, "create_receipt", createPayload),
    );
    expect(created.isError).toBe(false);
    expect(created.structuredContent).toEqual({ receipt });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects invalid receipt details through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "create_receipt", { ...createPayload, items: [] }),
    );
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'create_receipt'");
    expect(invalid.content[0]?.text).toContain("items");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);
