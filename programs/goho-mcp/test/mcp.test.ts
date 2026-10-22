import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { expect } from "vitest";

import { startMcpClient } from "./support/mcp-client.ts";

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
    const client = yield* startMcpClient("http://127.0.0.1:3000");
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
