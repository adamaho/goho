import { RecipeUpload, RecipeUploadId } from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the get recipe upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_recipe_upload", {
  description:
    "Get one Goho recipe upload by upload ID with its latest status. A succeeded upload has the recipeId to pass to get_recipe; a failed one has a failureCode explaining why.",
  parameters: Schema.Struct({ upload_id: RecipeUploadId }),
  success: Schema.Struct({ upload: RecipeUpload }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a get recipe upload request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/GetRecipeUpload.handle")(function* ({
  upload_id,
}: {
  readonly upload_id: RecipeUploadId;
}) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.recipeUploads
    .get({ params: { uploadId: upload_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "RecipeUploadNotFound"
          ? new ToolFailure({ message: `Recipe upload ${upload_id} was not found.` })
          : apiFailure("get recipe upload", cause),
      ),
    );
  return { upload: response.data };
});
