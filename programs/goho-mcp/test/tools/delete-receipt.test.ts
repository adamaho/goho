import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { DeleteResult, ErrorResult, startMcpClient } from "#test/support/mcp-client.ts";

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("DELETE");

    if (request.url === "/receipts/42") {
      return HttpServerResponse.empty({ status: 204 });
    }
    if (request.url === "/receipts/999") {
      return HttpServerResponse.jsonUnsafe({ _tag: "NotFound" }, { status: 404 });
    }
    return HttpServerResponse.empty({ status: 500 });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("deletes a saved receipt by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const deleted = yield* Schema.decodeUnknownEffect(DeleteResult)(
      yield* client.call(2, "delete_receipt", { receipt_id: "42" }),
    );
    expect(deleted.isError).toBe(false);
    expect(deleted.structuredContent).toEqual({ deleted_receipt_id: "42" });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("reports a missing receipt when deleting through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "delete_receipt", { receipt_id: "999" }),
    );
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("Receipt 999 was not found.");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("reports server failures when deleting through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "delete_receipt", { receipt_id: "7" }),
    );
    expect(failed.isError).toBe(true);
    expect(failed.content[0]?.text).toContain("Could not delete receipt.");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects an invalid receipt ID when deleting through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "delete_receipt", { receipt_id: "0" }),
    );
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'delete_receipt'");
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);
