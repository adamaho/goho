import { layer } from "@effect/vitest";
import { ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { apiAdvice, ListResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");
  expect(request.url).toBe("/receipts");
  return HttpServerResponse.jsonUnsafe({ data: [receipt] });
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("list_receipts", (it) => {
  it.effect("lists populated and empty Goho receipts through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const listed = yield* Schema.decodeUnknownEffect(ListResult)(
        yield* client.call(2, "list_receipts", {}),
      );
      expect(listed.isError).toBe(false);
      expect(listed.structuredContent).toEqual({ receipts: [receipt] });

      yield* McpFixture.respondWith(Effect.as(routes, HttpServerResponse.jsonUnsafe({ data: [] })));
      const empty = yield* Schema.decodeUnknownEffect(ListResult)(
        yield* client.call(3, "list_receipts", {}),
      );
      expect(empty.structuredContent).toEqual({ receipts: [] });
    }),
  );

  it.effect("returns MCP tool errors when listing receipts fails", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: McpFixture.dropConnections,
          text: `Could not list receipts. ${apiAdvice.unreachable}`,
        },
        {
          routes: HttpServerRespondable.toResponse(new ReceiptsUnavailable()),
          text: `Could not list receipts. ${apiAdvice.serverFailed}`,
        },
        {
          // An undeclared 5xx with no problem body, such as a proxy's, is still a server failure.
          routes: Effect.succeed(HttpServerResponse.empty({ status: 502 })),
          text: `Could not list receipts. ${apiAdvice.serverFailed}`,
        },
      ];

      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "list_receipts", {})).toEqual(
          toolError(testCase.text),
        );
      }
    }),
  );
});
