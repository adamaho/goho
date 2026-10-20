import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ReceiptResult, startMcpClient } from "#test/support/mcp-client.ts";

const corrections = {
  storeName: "Corner Store",
  receiptDate: "2026-09-14",
};

const ServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("PATCH");

    if (request.url === "/receipts/42") {
      expect(yield* request.json).toEqual(corrections);
      return HttpServerResponse.jsonUnsafe({ data: { ...receipt, ...corrections } });
    }
    if (request.url === "/receipts/43") {
      expect(yield* request.json).toEqual({ receiptDate: "2026-09-14" });
      return HttpServerResponse.jsonUnsafe({
        data: { ...receipt, id: "43", receiptDate: "2026-09-14" },
      });
    }
    if (request.url === "/receipts/999") {
      return HttpServerResponse.jsonUnsafe({ _tag: "NotFound" }, { status: 404 });
    }
    if (request.url === "/receipts/400") {
      return HttpServerResponse.empty({ status: 400 });
    }
    return HttpServerResponse.empty({ status: 500 });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("patches receipt details through MCP and returns the complete receipt", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const patched = yield* Schema.decodeUnknownEffect(ReceiptResult)(
      yield* client.call(2, "patch_receipt", {
        receipt_id: "42",
        changes: { ...corrections, storeName: "  Corner Store  " },
      }),
    );
    expect(patched.isError).toBe(false);
    expect(patched.structuredContent).toEqual({ receipt: { ...receipt, ...corrections } });

    const partial = yield* Schema.decodeUnknownEffect(ReceiptResult)(
      yield* client.call(3, "patch_receipt", {
        receipt_id: "43",
        changes: { receiptDate: "2026-09-14" },
      }),
    );
    expect(partial.isError).toBe(false);
    expect(partial.structuredContent).toEqual({
      receipt: { ...receipt, id: "43", receiptDate: "2026-09-14" },
    });
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("reports missing receipts, rejected corrections, and server failures through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));
    const cases = [
      { receipt_id: "999", message: "Receipt 999 was not found." },
      { receipt_id: "400", message: "The receipt correction was rejected." },
      { receipt_id: "500", message: "Could not patch receipt." },
    ];

    for (const [index, testCase] of cases.entries()) {
      const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(index + 2, "patch_receipt", {
          receipt_id: testCase.receipt_id,
          changes: { storeName: "Corner Store" },
        }),
      );
      expect(failed.isError).toBe(true);
      expect(failed.content[0]?.text).toContain(testCase.message);
    }
  }).pipe(Effect.provide([ServerLive, NodeServices.layer])),
);

it.effect("rejects invalid receipt patches before contacting the API", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const valid = { receipt_id: "42", changes: { storeName: "Corner Store" } };
    const invalidInputs = [
      { ...valid, receipt_id: "0" },
      { ...valid, receipt_id: 42 },
      { changes: valid.changes },
      { receipt_id: "42" },
      { ...valid, changes: {} },
      { ...valid, changes: null },
      { ...valid, changes: { storeName: "  " } },
      { ...valid, changes: { storeName: null } },
      { ...valid, changes: { receiptDate: "2026-02-30" } },
      { ...valid, changes: { total: "100" } },
      { ...valid, changes: { storeName: "Corner Store", total: "100" } },
      // Categories belong to items now.
      { ...valid, changes: { category: "Household" } },
      { ...valid, changes: { currency: "CAD" } },
      { ...valid, changes: { items: [] } },
      { ...valid, changes: { store_name: "Corner Store" } },
      { ...valid, total: "100" },
    ];

    for (const [index, input] of invalidInputs.entries()) {
      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(index + 2, "patch_receipt", input),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'patch_receipt'");
    }
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("reports an unavailable API when patching a receipt", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.call(2, "patch_receipt", {
        receipt_id: "42",
        changes: { storeName: "Corner Store" },
      }),
    );
    expect(failed.isError).toBe(true);
    expect(failed.content[0]?.text).toContain("Could not patch receipt.");
  }).pipe(Effect.provide(NodeServices.layer)),
);
