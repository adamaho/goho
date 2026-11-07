import { layer } from "@effect/vitest";
import { ReceiptNotFound, ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { apiAdvice, ErrorResult, ReceiptResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === "/receipts/42") {
    return HttpServerResponse.jsonUnsafe({ data: receipt });
  }
  if (request.url === "/receipts/43") {
    // Money is a decimal string on the wire, so a number must not reach the client as a receipt.
    return HttpServerResponse.jsonUnsafe({ data: { ...receipt, id: "43", total: 23.22 } });
  }
  if (request.url === "/receipts/999") {
    return yield* HttpServerRespondable.toResponse(new ReceiptNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new ReceiptsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_receipt", (it) => {
  it.effect("gets a saved receipt by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const found = yield* Schema.decodeUnknownEffect(ReceiptResult)(
        yield* client.call(2, "get_receipt", { receipt_id: "42" }),
      );
      expect(found.isError).toBe(false);
      expect(found.structuredContent).toEqual({ receipt });
    }),
  );

  it.effect(
    "reports missing receipts, server failures, and incompatible responses through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { receipt_id: "999", text: "Receipt 999 was not found." },
          { receipt_id: "500", text: `Could not get receipt. ${apiAdvice.serverFailed}` },
          { receipt_id: "43", text: `Could not get receipt. ${apiAdvice.incompatible}` },
        ];

        for (const [index, { receipt_id, text }] of cases.entries()) {
          expect(yield* client.call(index + 2, "get_receipt", { receipt_id })).toEqual(
            toolError(text),
          );
        }
      }),
  );

  it.effect("rejects an invalid receipt ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_receipt", { receipt_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'get_receipt': /);
      expect(invalid.content[0]?.text).toContain("receipt_id");
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
