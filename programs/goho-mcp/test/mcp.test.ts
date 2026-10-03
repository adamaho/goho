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
      }),
    }),
  ),
});

it.effect("registers the receipt tools through MCP", () =>
  Effect.gen(function* () {
    const client = yield* startMcpClient("http://127.0.0.1:3000");
    const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
      yield* client.request(2, "tools/list", {}),
    );

    expect(discovered.tools.map((tool) => tool.name)).toEqual([
      "list_receipts",
      "get_receipt",
      "create_receipt",
      "delete_receipt",
    ]);
    expect(discovered.tools[0]?.annotations.readOnlyHint).toBe(true);
    expect(discovered.tools[1]?.annotations.readOnlyHint).toBe(true);
    expect(discovered.tools[2]?.annotations.readOnlyHint).toBe(false);
    expect(discovered.tools[3]?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  }).pipe(Effect.provide(NodeServices.layer)),
);
