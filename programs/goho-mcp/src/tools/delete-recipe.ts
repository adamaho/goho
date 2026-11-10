import { RecipeId } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the delete recipe MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("delete_recipe", {
  description:
    "Permanently delete one saved Goho recipe by recipe ID, including every import linked to it and its photo, so its page can be imported fresh. Only call this when the user clearly asks to delete that recipe.",
  parameters: Schema.Struct({ recipe_id: RecipeId }),
  success: Schema.Struct({ deleted_recipe_id: RecipeId }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a delete recipe request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/DeleteRecipe.handle")(function* ({
  recipe_id,
}: {
  readonly recipe_id: RecipeId;
}) {
  const client = yield* GohoServerClient.Service;
  yield* client.recipes
    .delete({ params: { recipeId: recipe_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "RecipeNotFound"
          ? new ToolFailure({ message: `Recipe ${recipe_id} was not found.` })
          : apiFailure("delete recipe", cause),
      ),
    );
  return { deleted_recipe_id: recipe_id };
});
