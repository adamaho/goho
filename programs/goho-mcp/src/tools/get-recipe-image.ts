import { RecipeId } from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";
import * as ImageTool from "./image.ts";

const action = "get recipe image";

/**
 * Registers the get recipe image MCP tool with the Goho server client.
 *
 * @category tools
 * @since 0.1.0
 */
export const register = Effect.gen(function* () {
  const client = yield* GohoServerClient.Service;
  yield* ImageTool.register({
    name: "get_recipe_image",
    description:
      "Get the photo on file for one saved Goho recipe by recipe ID, returned as an image. Recipes entered by hand have none.",
    action,
    parameters: Schema.Struct({ recipe_id: RecipeId }),
    get: ({ recipe_id }) =>
      client.recipes.getImage({ params: { recipeId: recipe_id } }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "RecipeImageNotFound"
            ? new ToolFailure({
                message: `Recipe ${recipe_id} has no photo, or it was not found.`,
              })
            : apiFailure(action, cause),
        ),
      ),
  });
});
