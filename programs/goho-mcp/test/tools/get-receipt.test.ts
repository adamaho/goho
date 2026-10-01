import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ReceiptResult, startMcpClient } from "#test/support/mcp-client.ts";

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");

    if (request.url === "/receipts/42") {
      return HttpServerResponse.jsonUnsafe({ data: receipt });
    }
    if (request.url === "/receipts/999") {
      return HttpServerResponse.jsonUnsafe({ _tag: "NotFound" }, { status: 404 });
    }
    return HttpServerResponse.empty({ status: 500 });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("gets a saved receipt by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const found = yield* Schema.decodeUnknownEffect(ReceiptResult)(
      yield* client.call(2, "get_receipt", { receipt_id: "42" }),
    );
    expect(found.isError).toBe(false);
    expect(found.structuredContent).toEqual({ receipt });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("reports a missing receipt by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "get_receipt", { receipt_id: "999" }),
    );
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("Receipt 999 was not found.");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects an invalid receipt ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "get_receipt", { receipt_id: "0" }),
    );
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'get_receipt'");
    expect(invalid.content[0]?.text).toContain("receipt_id");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);
