import { RecipeSummary } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the list recipes MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("list_recipes", {
  description:
    "List saved Goho recipe headlines by title A to Z, ignoring case, then newest first. Each has its ID, title, source, total time, and whether a photo is on file, but no ingredients, steps, or yield; use get_recipe for those.",
  success: Schema.Struct({ recipes: Schema.Array(RecipeSummary) }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a list recipes request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/ListRecipes.handle")(function* () {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.recipes
    .list()
    .pipe(Effect.mapError((cause) => apiFailure("list recipes", cause)));
  return { recipes: response.data };
});
