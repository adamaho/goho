import { layer } from "@effect/vitest";
import { ReceiptNotFound } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ReceiptResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const corrections = {
  storeName: "Corner Store",
  receiptDate: "2026-09-14",
};

const routes = Effect.gen(function* () {
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
    return yield* HttpServerRespondable.toResponse(new ReceiptNotFound());
  }
  if (request.url === "/receipts/400") {
    return yield* HttpServerRespondable.toResponse(
      new HttpApiError.BadRequestProblem({ detail: "Request validation failed" }),
    );
  }
  return HttpServerResponse.empty({ status: 500 });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("patch_receipt", (it) => {
  it.effect("patches receipt details through MCP and returns the complete receipt", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

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
    }),
  );

  it.effect("reports missing receipts, rejected corrections, and server failures through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
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
    }),
  );

  it.effect("rejects invalid receipt patches before contacting the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
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
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports an unavailable API when patching a receipt", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      const failed = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "patch_receipt", {
          receipt_id: "42",
          changes: { storeName: "Corner Store" },
        }),
      );
      expect(failed.isError).toBe(true);
      expect(failed.content[0]?.text).toContain("Could not patch receipt.");
    }),
  );
});
