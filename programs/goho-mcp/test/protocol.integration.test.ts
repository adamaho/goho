import { layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { connectMcpClient } from "./support/mcp-client.ts";
import * as McpFixture from "./support/mcp-fixture.ts";

const ToolList = Schema.Struct({
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      inputSchema: Schema.Unknown,
      outputSchema: Schema.optional(Schema.Unknown),
      annotations: Schema.Struct({
        readOnlyHint: Schema.Boolean,
        destructiveHint: Schema.Boolean,
        idempotentHint: Schema.Boolean,
        openWorldHint: Schema.Boolean,
      }),
    }),
  ),
});

const routes = Effect.succeed(HttpServerResponse.empty({ status: 500 }));

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("MCP protocol", (it) => {
  it.effect("registers the receipt, book, recipe, and upload tools through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
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
        "list_recipes",
        "get_recipe",
        "create_recipe",
        "delete_recipe",
        "list_recipe_uploads",
        "get_recipe_upload",
        "create_recipe_upload",
        "delete_recipe_upload",
        "list_receipt_uploads",
        "get_receipt_upload",
        "delete_receipt_upload",
        "list_book_uploads",
        "get_book_upload",
        "delete_book_upload",
        "get_receipt_image",
        "get_book_image",
        "get_recipe_image",
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
      for (const name of [
        "list_recipes",
        "get_recipe",
        "list_recipe_uploads",
        "get_recipe_upload",
        "list_receipt_uploads",
        "get_receipt_upload",
        "list_book_uploads",
        "get_book_upload",
        "get_receipt_image",
        "get_book_image",
        "get_recipe_image",
      ]) {
        expect(annotationsOf(name)).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
      expect(annotationsOf("create_recipe")).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
      for (const name of [
        "delete_recipe",
        "delete_recipe_upload",
        "delete_receipt_upload",
        "delete_book_upload",
      ]) {
        expect(annotationsOf(name)).toEqual({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
      // Image tools return native image content with no structured copy, and take the same saved
      // ID as the matching record lookup.
      for (const kind of ["receipt", "book", "recipe"]) {
        const image = discovered.tools.find((tool) => tool.name === `get_${kind}_image`);
        const record = discovered.tools.find((tool) => tool.name === `get_${kind}`);
        expect(image).not.toHaveProperty("outputSchema");
        expect(record?.outputSchema).toBeDefined();
        expect(image?.inputSchema).toEqual(record?.inputSchema);
      }
      // Creating an upload leads the API to fetch a page outside Goho.
      expect(annotationsOf("create_recipe_upload")).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    }),
  );

  it.effect("negotiates the earlier supported MCP protocol revision", () =>
    Effect.gen(function* () {
      const { url } = yield* McpFixture.Service;
      const client = yield* connectMcpClient(url, "2025-06-18");
      const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
        yield* client.request(2, "tools/list", {}),
      );
      expect(discovered.tools).toHaveLength(28);
    }),
  );

  it.effect("reports liveness without contacting the API", () =>
    Effect.gen(function* () {
      const { url } = yield* McpFixture.Service;
      yield* McpFixture.openSession;
      const response = yield* HttpClient.get(`${url}/health`);
      expect(response.status).toBe(200);
      expect(yield* response.json).toEqual({ data: { status: "ok" } });
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
});
