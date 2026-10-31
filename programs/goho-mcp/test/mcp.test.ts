import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { expect } from "vitest";

import { connectMcpClient, startMcpClient, startMcpServer } from "./support/mcp-client.ts";

const ToolList = Schema.Struct({
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      annotations: Schema.Struct({
        readOnlyHint: Schema.Boolean,
        destructiveHint: Schema.Boolean,
        idempotentHint: Schema.Boolean,
        openWorldHint: Schema.Boolean,
      }),
    }),
  ),
});

it.effect("registers the receipt and book tools through MCP", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:1");
    const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
      yield* client.request(2, "tools/list", {}),
    );
    const annotationsOf = (name: string) =>
      discovered.tools.find((tool) => tool.name === name)?.annotations;

    expect(discovered.tools.map((tool) => tool.name)).toEqual([
      "list_receipts",
      "get_receipt",
      "create_receipt",
      "delete_receipt",
      "patch_receipt",
      "patch_receipt_item",
      "list_books",
      "get_book",
      "create_book",
      "delete_book",
      "patch_book",
    ]);
    for (const name of ["list_receipts", "get_receipt", "list_books", "get_book"]) {
      expect(annotationsOf(name)?.readOnlyHint).toBe(true);
    }
    expect(annotationsOf("create_receipt")?.readOnlyHint).toBe(false);
    expect(annotationsOf("create_book")).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    for (const name of ["patch_receipt", "patch_receipt_item", "patch_book"]) {
      expect(annotationsOf(name)).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    for (const name of ["delete_receipt", "delete_book"]) {
      expect(annotationsOf(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
    }
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("negotiates the earlier supported MCP protocol revision", () =>
  Effect.gen(function* () {
    const { url } = yield* startMcpServer("http://127.0.0.1:1");
    const client = yield* connectMcpClient(url, "2025-06-18");
    const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
      yield* client.request(2, "tools/list", {}),
    );
    expect(discovered.tools).toHaveLength(11);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("reports liveness without contacting the API", () =>
  Effect.gen(function* () {
    const { url } = yield* startMcpServer("http://127.0.0.1:1");
    const response = yield* HttpClient.get(`${url}/health`);
    expect(response.status).toBe(200);
    expect(yield* response.json).toEqual({ data: { status: "ok" } });
  }).pipe(Effect.provide([NodeServices.layer, FetchHttpClient.layer])),
);

it.effect("stops listening when the process is terminated", () =>
  Effect.gen(function* () {
    const { child, url } = yield* startMcpServer("http://127.0.0.1:1");
    yield* child.kill();
    expect(yield* child.isRunning).toBe(false);
    const refused = yield* HttpClient.get(`${url}/health`).pipe(Effect.flip);
    expect(refused._tag).toBe("HttpClientError");
  }).pipe(Effect.provide([NodeServices.layer, FetchHttpClient.layer])),
);
