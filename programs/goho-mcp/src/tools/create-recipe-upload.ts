import { CreateRecipeUploadRequest, RecipeUpload } from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the create recipe upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("create_recipe_upload", {
  description:
    "Queue a recipe upload from a web page URL and return the queued upload right away, not the finished recipe. The Goho API fetches the page and extracts the recipe later. Each call queues a new upload, even for a URL already sent; a page already saved as a recipe links that recipe without another fetch. Check progress with get_recipe_upload when the user asks, then use get_recipe with its recipeId once it succeeds. Only call this when the user wants to import that URL.",
  parameters: CreateRecipeUploadRequest,
  success: Schema.Struct({ upload: RecipeUpload }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Strict, true)
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  // The Goho API later fetches the page, which reaches outside Goho.
  .annotate(Tool.OpenWorld, true);

/**
 * Handles a create recipe upload request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/CreateRecipeUpload.handle")(function* (
  payload: CreateRecipeUploadRequest,
) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.recipeUploads
    .create({ payload })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "BadRequestProblem"
          ? new ToolFailure({ message: "The recipe URL was rejected. Check the supplied URL." })
          : apiFailure("create recipe upload", cause),
      ),
    );
  return { upload: response.data };
});
