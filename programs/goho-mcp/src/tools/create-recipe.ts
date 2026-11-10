import { CreateRecipeRequest, Recipe } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the create recipe MCP tool.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("create_recipe", {
  description:
    "Create a saved Goho recipe from a title, ingredients, and steps the user supplied, with no source or photo. Each call saves a new recipe, even when one already has that title. Keep quantities exact and wording as supplied, and leave out the yield or total time when it isn't known rather than guessing. Use fictional recipe details only when the user asks for an example.",
  parameters: CreateRecipeRequest,
  success: Schema.Struct({ recipe: Recipe }),
  failure: ToolFailure,
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Strict, true)
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

/**
 * Handles a create recipe request with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const handle = Effect.fn("@goho/CreateRecipe.handle")(function* (
  payload: CreateRecipeRequest,
) {
  const client = yield* GohoServerClient.Service;
  const response = yield* client.recipes.create({ payload }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "BadRequestProblem"
        ? new ToolFailure({
            message: "The recipe details were rejected. Check the supplied details.",
          })
        : apiFailure("create recipe", cause),
    ),
  );
  return { recipe: response.data };
});
