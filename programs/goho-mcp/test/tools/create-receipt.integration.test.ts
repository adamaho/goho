import { layer } from "@effect/vitest";
import { ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import { createPayload, receipt } from "#test/fixtures/receipt.ts";
import { apiAdvice, ErrorResult, ReceiptResult, toolError } from "#test/support/mcp-client.ts";
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
      expect(invalid.content[0]?.text).toMatch(/^Invalid parameters for tool 'create_receipt': /);
      expect(invalid.content[0]?.text).toContain("items");
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );

  it.effect("reports rejected details, server failures, and an unavailable API through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: HttpServerRespondable.toResponse(
            new HttpApiError.BadRequestProblem({ detail: "Request validation failed" }),
          ),
          text: "The receipt details were rejected. Check the supplied details.",
        },
        {
          routes: HttpServerRespondable.toResponse(new ReceiptsUnavailable()),
          text: `Could not create receipt. ${apiAdvice.serverFailed}`,
        },
        {
          routes: McpFixture.dropConnections,
          text: `Could not create receipt. ${apiAdvice.unreachable}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "create_receipt", createPayload)).toEqual(
          toolError(testCase.text),
        );
      }
    }),
  );
});
