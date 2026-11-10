import { Recipe, RecipeId } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the get recipe MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("get_recipe", {
  description:
    "Get one saved Goho recipe by recipe ID, with its ingredients, steps, yield, total time, and source.",
  parameters: Schema.Struct({ recipe_id: RecipeId }),
  success: Schema.Struct({ recipe: Recipe }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a get recipe request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/GetRecipe.handle")(function* ({
  recipe_id,
}: {
  readonly recipe_id: RecipeId;
}) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.recipes
    .get({ params: { recipeId: recipe_id } })
    .pipe(
      Effect.mapError((cause) =>
        cause._tag === "RecipeNotFound"
          ? new ToolFailure({ message: `Recipe ${recipe_id} was not found.` })
          : apiFailure("get recipe", cause),
      ),
    );
  return { recipe: response.data };
});
