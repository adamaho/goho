import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { receipt } from "#test/fixtures/receipt.ts";
import { ErrorResult, ListResult } from "#test/support/mcp-client.ts";
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

  it.effect("returns an MCP tool error when Goho server is unavailable", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      yield* McpFixture.respondWith(McpFixture.dropConnections);

      const unavailable = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "list_receipts", {}),
      );
      expect(unavailable.isError).toBe(true);
      expect(unavailable.content[0]?.text).toMatch(/Could not list receipts/);
    }),
  );
});
