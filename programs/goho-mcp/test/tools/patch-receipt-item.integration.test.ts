import { layer } from "@effect/vitest";
import { ReceiptItemNotFound, ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import { apiAdvice, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const item = {
  id: "9007199254740993",
  position: 0,
  name: "Granny Smith apples",
  amount: "4.5",
  category: { id: "9", name: "snacks", icon: "other", color: "grey", kinds: ["receipt"] },
};

const ItemResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ item: Schema.Unknown }),
});

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("PATCH");

  if (request.url === `/receipts/42/items/${item.id}`) {
    expect(yield* request.json).toEqual({ name: item.name, category: "Snacks" });
    return HttpServerResponse.jsonUnsafe({ data: item });
  }
  if (request.url === "/receipts/999/items/7" || request.url === "/receipts/42/items/999") {
    return yield* HttpServerRespondable.toResponse(new ReceiptItemNotFound());
  }
  if (request.url === "/receipts/42/items/400") {
    return yield* HttpServerRespondable.toResponse(
      new HttpApiError.BadRequestProblem({ detail: "Request validation failed" }),
    );
  }
  return yield* HttpServerRespondable.toResponse(new ReceiptsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("patch_receipt_item", (it) => {
  it.effect("corrects a receipt item through MCP without rounding its ID", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const patched = yield* Schema.decodeUnknownEffect(ItemResult)(
        yield* client.call(2, "patch_receipt_item", {
          receipt_id: "42",
          item_id: item.id,
          changes: { name: `  ${item.name}  `, category: " Snacks " },
        }),
      );
      expect(patched.isError).toBe(false);
      expect(patched.structuredContent).toEqual({ item });
    }),
  );

  it.effect(
    "reports missing items or receipts, rejected renames, and server failures through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { receipt_id: "999", item_id: "7", message: "Item 7 was not found on receipt 999." },
          { receipt_id: "42", item_id: "999", message: "Item 999 was not found on receipt 42." },
          {
            receipt_id: "42",
            item_id: "400",
            message: "The item correction was rejected. Check the supplied changes.",
          },
          {
            receipt_id: "42",
            item_id: "500",
            message: `Could not patch receipt item. ${apiAdvice.serverFailed}`,
          },
        ];

        for (const [index, testCase] of cases.entries()) {
          expect(
            yield* client.call(index + 2, "patch_receipt_item", {
              receipt_id: testCase.receipt_id,
              item_id: testCase.item_id,
              changes: { name: item.name },
            }),
          ).toEqual(toolError(testCase.message));
        }
      }),
  );

  it.effect("rejects invalid item patches before contacting the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const valid = { receipt_id: "42", item_id: "7", changes: { name: item.name } };
      const invalidInputs = [
        { ...valid, receipt_id: "0" },
        { ...valid, receipt_id: "abc" },
        { ...valid, receipt_id: "9223372036854775808" },
        { ...valid, receipt_id: 42 },
        { ...valid, item_id: "0" },
        { ...valid, item_id: "abc" },
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
        { ...valid, changes: { category: "  " } },
        { ...valid, changes: { name: item.name, category: null } },
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
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'patch_receipt_item': /,
        );
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports an unavailable API when patching a receipt item", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      expect(
        yield* client.call(2, "patch_receipt_item", {
          receipt_id: "42",
          item_id: "7",
          changes: { name: item.name },
        }),
      ).toEqual(toolError(`Could not patch receipt item. ${apiAdvice.unreachable}`));
    }),
  );
});
