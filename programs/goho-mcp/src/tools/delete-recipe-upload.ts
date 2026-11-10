import { RecipeUploadId } from "@goho/goho-server-client/recipe-uploads";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the delete recipe upload MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("delete_recipe_upload", {
  description:
    "Permanently delete one failed Goho recipe upload by upload ID. Queued, processing, and succeeded uploads can't be deleted, and this never deletes a saved recipe. To retry a failed URL, just create a new upload instead. Only call this when the user clearly asks to delete that upload.",
  parameters: Schema.Struct({ upload_id: RecipeUploadId }),
  success: Schema.Struct({ deleted_upload_id: RecipeUploadId }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a delete recipe upload request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/DeleteRecipeUpload.handle")(function* ({
  upload_id,
}: {
  readonly upload_id: RecipeUploadId;
}) {
  const client = yield* GohoServerClient.Service;
  yield* client.recipeUploads.delete({ params: { uploadId: upload_id } }).pipe(
    Effect.mapError((cause) => {
      switch (cause._tag) {
        case "RecipeUploadNotFound":
          return new ToolFailure({ message: `Recipe upload ${upload_id} was not found.` });
        case "RecipeUploadConflict":
          return new ToolFailure({
            message: "Only failed recipe uploads can be deleted. Nothing changed.",
          });
        default:
          return apiFailure("delete recipe upload", cause);
      }
    }),
  );
  return { deleted_upload_id: upload_id };
});
