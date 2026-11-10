import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Checks API liveness, not the MCP process or its downstream dependencies.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_health", {
  description:
    "Check whether the Goho API is responding. This checks API liveness only, not the database, AI providers, or background processing, and is separate from the MCP server's own health check.",
  success: Schema.Struct({ status: Schema.Literal("ok") }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Forwards one health check through the shared typed API client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/GetHealth.handle")(function* () {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.health
    .check()
    .pipe(Effect.mapError((cause) => apiFailure("get health", cause)));
  return response.data;
});
