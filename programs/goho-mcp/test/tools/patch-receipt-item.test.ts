import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { ErrorResult, startMcpClient } from "#test/support/mcp-client.ts";

const item = {
  id: "9007199254740993",
  position: 0,
  name: "Granny Smith apples",
  amount: "4.5",
};

const ItemResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ item: Schema.Unknown }),
});

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("PATCH");
    expect(yield* request.json).toEqual({ name: item.name });

    if (request.url === `/receipts/42/items/${item.id}`) {
      return HttpServerResponse.jsonUnsafe({ data: item });
    }
    if (request.url === "/receipts/999/items/7" || request.url === "/receipts/42/items/999") {
      return HttpServerResponse.jsonUnsafe({ _tag: "NotFound" }, { status: 404 });
    }
    if (request.url === "/receipts/42/items/400") {
      return HttpServerResponse.empty({ status: 400 });
    }
    return HttpServerResponse.empty({ status: 500 });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("renames a receipt item through MCP without rounding its ID", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const patched = yield* Schema.decodeUnknownEffect(ItemResult)(
      yield* client.call(2, "patch_receipt_item", {
        receipt_id: "42",
        item_id: item.id,
        changes: { name: `  ${item.name}  ` },
      }),
    );
    expect(patched.isError).toBe(false);
    expect(patched.structuredContent).toEqual({ item });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect(
  "reports missing items or receipts, rejected renames, and server failures through MCP",
  () =>
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const client = yield* startMcpClient(HttpServer.formatAddress(server.address));
      const cases = [
        { receipt_id: "999", item_id: "7", message: "Item 7 was not found on receipt 999." },
        { receipt_id: "42", item_id: "999", message: "Item 999 was not found on receipt 42." },
        { receipt_id: "42", item_id: "400", message: "The item correction was rejected." },
        { receipt_id: "42", item_id: "500", message: "Could not patch receipt item." },
      ];

      for (const [index, testCase] of cases.entries()) {
        const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "patch_receipt_item", {
            receipt_id: testCase.receipt_id,
            item_id: testCase.item_id,
            changes: { name: item.name },
          }),
        );
        expect(failed.isError).toBe(true);
        expect(failed.content[0]?.text).toContain(testCase.message);
      }
    }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects invalid item patches before contacting the API", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const valid = { receipt_id: "42", item_id: "7", changes: { name: item.name } };
    const invalidInputs = [
      { ...valid, receipt_id: "0" },
      { ...valid, receipt_id: 42 },
      { ...valid, item_id: "0" },
      { ...valid, item_id: "07" },
      { ...valid, item_id: "9223372036854775808" },
      { ...valid, item_id: 7 },
      { receipt_id: "42", changes: valid.changes },
      { item_id: "7", changes: valid.changes },
      { receipt_id: "42", item_id: "7" },
      { ...valid, changes: {} },
      { ...valid, changes: null },
      { ...valid, changes: { name: "  " } },
      { ...valid, changes: { name: null } },
      { ...valid, changes: { name: item.name, amount: "10" } },
      { ...valid, changes: { name: item.name, position: 1 } },
      { ...valid, changes: { name: item.name, id: "8" } },
      { ...valid, amount: "10" },
    ];

    for (const [index, input] of invalidInputs.entries()) {
      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(index + 2, "patch_receipt_item", input),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain(
        "Invalid parameters for tool 'patch_receipt_item'",
      );
    }
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("reports an unavailable API when patching a receipt item", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "patch_receipt_item", {
        receipt_id: "42",
        item_id: "7",
        changes: { name: item.name },
      }),
    );
    expect(failed.isError).toBe(true);
    expect(failed.content[0]?.text).toContain("Could not patch receipt item.");
  }).pipe(Effect.provide(NodeServices.layer)),
);
