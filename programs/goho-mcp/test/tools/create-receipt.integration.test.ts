import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { createPayload, receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ReceiptResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("POST");
  expect(request.url).toBe("/receipts");
  expect(yield* request.json).toEqual(createPayload);
  return HttpServerResponse.jsonUnsafe({ data: receipt });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("create_receipt", (it) => {
  it.effect("creates a receipt through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const created = yield* Schema.decodeUnknownEffect(ReceiptResult)(
        yield* client.call(2, "create_receipt", createPayload),
      );
      expect(created.isError).toBe(false);
      expect(created.structuredContent).toEqual({ receipt });
    }),
  );

  it.effect("rejects invalid receipt details through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "create_receipt", { ...createPayload, items: [] }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'create_receipt'");
      expect(invalid.content[0]?.text).toContain("items");
    }),
  );
});
