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
  description: [
    "Create a saved Goho recipe from a title, ingredients, and steps the user supplied, with no source or photo. Each call saves a new recipe, even when one already has that title. Keep quantities exact and wording as supplied, and leave out the yield or total time when it isn't known rather than guessing. Use fictional recipe details only when the user asks for an example.",
    "Write each step as ordered segments. Use ingredient marks for ingredient references, not just plain text, so Goho can link and highlight them. Each ingredient needs a unique id within this recipe; a mark's ingredientId must match that id exactly.",
    'For example, with an ingredient whose id is "butter", a step using all of it is {"segments":[{"kind":"text","text":"Melt "},{"kind":"mark","content":{"kind":"ingredient","ingredientId":"butter","portion":{"numerator":1,"denominator":1}}},{"kind":"text","text":" in a pan."}]}.',
    "The portion is the fraction of that ingredient's recipe quantity used in this step, not the quantity itself: 1/1 means all and 1/2 means half. It must be greater than zero and no greater than one. An ingredient mark displays the computed amount and ingredient name, replacing both in the step; do not repeat either as plain text. Keep surrounding wording, spaces, and punctuation in text segments.",
    'Do not guess an unknown portion: preserve that reference as a text mark, for example {"kind":"mark","content":{"kind":"text","text":"some of the sugar"}}. A text mark highlights literal wording but does not link to an ingredient; use content.kind "ingredient" when the portion is known. Steps with no ingredient references may remain plain text segments.',
  ].join(" "),
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
