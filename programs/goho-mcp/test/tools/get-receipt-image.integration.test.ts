import { layer } from "@effect/vitest";
import { ReceiptImageNotFound, ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { jpeg } from "#test/fixtures/image.ts";
import {
  apiAdvice,
  connectMcpClient,
  ErrorResult,
  imageResult,
  toolError,
} from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

// Past 2^53, so a numeric round trip would change it.
const receiptId = "9007199254740993";
const headers = { "cache-control": "private, no-store" };

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  if (request.url === `/receipts/${receiptId}/image`) {
    return HttpServerResponse.uint8Array(jpeg, { contentType: "image/jpeg", headers });
  }
  if (request.url === "/receipts/999/image") {
    return yield* HttpServerRespondable.toResponse(new ReceiptImageNotFound());
  }
  // Bodies of types the API never stores must not reach the client as images.
  if (request.url === "/receipts/43/image") {
    return HttpServerResponse.uint8Array(jpeg, {
      contentType: "application/octet-stream",
      headers,
    });
  }
  if (request.url === "/receipts/44/image") {
    return HttpServerResponse.text('{"data":{}}', { contentType: "application/json", headers });
  }
  if (request.url === "/receipts/45/image") {
    return HttpServerResponse.uint8Array(new Uint8Array(), { contentType: "image/jpeg", headers });
  }
  return yield* HttpServerRespondable.toResponse(new ReceiptsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_receipt_image", (it) => {
  it.effect("gets a saved receipt's scanned image as native MCP image content", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "get_receipt_image", { receipt_id: receiptId })).toEqual(
        imageResult(jpeg, "image/jpeg"),
      );
      expect(yield* McpFixture.apiRequests).toEqual([`GET /receipts/${receiptId}/image`]);
    }),
  );

  it.effect("returns the same image content under the earlier MCP protocol revision", () =>
    Effect.gen(function* () {
      const { url } = yield* McpFixture.Service;
      yield* McpFixture.openSession;
      const client = yield* connectMcpClient(url, "2025-06-18");

      expect(yield* client.call(2, "get_receipt_image", { receipt_id: receiptId })).toEqual(
        imageResult(jpeg, "image/jpeg"),
      );
    }),
  );

  it.effect("reports missing images, API failures, and non-image responses through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        { receipt_id: "999", text: "Receipt 999 has no scanned image, or it was not found." },
        { receipt_id: "500", text: `Could not get receipt image. ${apiAdvice.serverFailed}` },
        { receipt_id: "43", text: `Could not get receipt image. ${apiAdvice.incompatible}` },
        { receipt_id: "44", text: `Could not get receipt image. ${apiAdvice.incompatible}` },
        { receipt_id: "45", text: `Could not get receipt image. ${apiAdvice.incompatible}` },
      ];

      for (const [index, { receipt_id, text }] of cases.entries()) {
        expect(yield* client.call(index + 2, "get_receipt_image", { receipt_id })).toEqual(
          toolError(text),
        );
      }

      yield* McpFixture.respondWith(McpFixture.dropConnections);
      expect(yield* client.call(10, "get_receipt_image", { receipt_id: receiptId })).toEqual(
        toolError(`Could not get receipt image. ${apiAdvice.unreachable}`),
      );
    }),
  );

  it.effect("rejects invalid receipt IDs without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // Zero, a leading zero, one past the largest bigint, a number, and no ID.
      const invalidArguments = [
        { receipt_id: "0" },
        { receipt_id: "012" },
        { receipt_id: "9223372036854775808" },
        { receipt_id: 42 },
        {},
      ];

      for (const [index, args] of invalidArguments.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "get_receipt_image", args),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'get_receipt_image': /,
        );
        expect(invalid.content[0]?.text).toContain("receipt_id");
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
