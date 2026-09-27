import { Receipt } from "@goho/goho-server-client/receipts";
import { Effect, Schema } from "effect";
import { Tool } from "effect/unstable/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

/**
 * Describes the list receipts MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("list_receipts", {
  description: "List all saved Goho receipts, newest first, including their items.",
  success: Schema.Struct({ receipts: Schema.Array(Receipt) }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a list receipts request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/ListReceipts.handle")(function* () {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.receipts
    .list()
    .pipe(
      Effect.mapError(
        () =>
          "Could not list receipts. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    );
  return { receipts: response.data };
});
