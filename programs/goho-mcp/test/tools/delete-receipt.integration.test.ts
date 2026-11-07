import { layer } from "@effect/vitest";
import { ReceiptNotFound, ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { apiAdvice, DeleteResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  if (request.url === "/receipts/42") {
    return HttpServerResponse.empty({ status: 204 });
  }
  if (request.url === "/receipts/999") {
    return yield* HttpServerRespondable.toResponse(new ReceiptNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new ReceiptsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("delete_receipt", (it) => {
  it.effect("deletes a saved receipt by ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const deleted = yield* Schema.decodeUnknownEffect(DeleteResult)(
        yield* client.call(2, "delete_receipt", { receipt_id: "42" }),
      );
      expect(deleted.isError).toBe(false);
      expect(deleted.structuredContent).toEqual({ deleted_receipt_id: "42" });
    }),
  );

  it.effect("reports a missing receipt when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_receipt", { receipt_id: "999" })).toEqual(
        toolError("Receipt 999 was not found."),
      );
    }),
  );

  it.effect("reports server failures when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_receipt", { receipt_id: "7" })).toEqual(
        toolError(`Could not delete receipt. ${apiAdvice.serverFailed}`),
      );
    }),
  );

  it.effect("rejects an invalid receipt ID when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "delete_receipt", { receipt_id: "0" }),
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'delete_receipt': /);
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
