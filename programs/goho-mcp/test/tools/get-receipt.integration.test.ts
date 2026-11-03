import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ReceiptResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === "/receipts/42") {
    return HttpServerResponse.jsonUnsafe({ data: receipt });
  }
  if (request.url === "/receipts/999") {
    return HttpServerResponse.jsonUnsafe({ _tag: "NotFound" }, { status: 404 });
  }
  return HttpServerResponse.empty({ status: 500 });
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

  it.effect("reports a missing receipt by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_receipt", { receipt_id: "999" }),
      );
      expect(missing.isError).toBe(true);
      expect(missing.content[0]?.text).toContain("Receipt 999 was not found.");
    }),
  );

  it.effect("rejects an invalid receipt ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "get_receipt", { receipt_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'get_receipt'");
      expect(invalid.content[0]?.text).toContain("receipt_id");
    }),
  );
});
