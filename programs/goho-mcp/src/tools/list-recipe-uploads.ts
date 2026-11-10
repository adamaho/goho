import { RecipeUpload } from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the list recipe uploads MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("list_recipe_uploads", {
  description:
    "List every Goho recipe upload from web page URLs, newest first, with its current status: queued, processing, succeeded with a recipeId, or failed with a failureCode.",
  success: Schema.Struct({ uploads: Schema.Array(RecipeUpload) }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a list recipe uploads request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/ListRecipeUploads.handle")(function* () {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.recipeUploads
    .list()
    .pipe(Effect.mapError((cause) => apiFailure("list recipe uploads", cause)));
  return { uploads: response.data };
});
