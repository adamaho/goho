import { layer } from "@effect/vitest";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { apiAdvice, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const routes = Effect.succeed(HttpServerResponse.jsonUnsafe({ data: { status: "ok" } }));

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_health", (it) => {
  it.effect("checks API liveness with one request and returns its status", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      expect(yield* client.call(2, "get_health", {})).toEqual({
        isError: false,
        content: [{ type: "text", text: JSON.stringify({ status: "ok" }) }],
        structuredContent: { status: "ok" },
      });
      expect(yield* McpFixture.apiRequests).toEqual(["GET /health"]);
    }),
  );

  it.effect("reports API failures and malformed responses instead of a healthy status", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      const cases = [
        {
          routes: Effect.succeed(HttpServerResponse.text("Upstream failed", { status: 500 })),
          advice: apiAdvice.serverFailed,
        },
        {
          routes: Effect.succeed(HttpServerResponse.jsonUnsafe({ data: { status: "down" } })),
          advice: apiAdvice.incompatible,
        },
        {
          routes: McpFixture.dropConnections,
          advice: apiAdvice.unreachable,
        },
      ];
      for (const [index, testCase] of cases.entries()) {
        yield* McpFixture.respondWith(testCase.routes);
        expect(yield* client.call(index + 2, "get_health", {})).toEqual(
          toolError(`Could not get health. ${testCase.advice}`),
        );
      }
      expect(yield* McpFixture.apiRequests).toEqual(["GET /health", "GET /health", "GET /health"]);
    }),
  );
});
