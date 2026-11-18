import {
  CreateRecipeRequest,
  Recipe,
  recipeWritingGuidance,
} from "@goho/goho-server-client/recipes";
import { Effect, Schema } from "effect";
import { Tool } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import { apiFailure, ToolFailure } from "./failure.ts";

/**
 * Describes the create recipe MCP tool. Its description embeds the shared
 * recipe writing guidance unchanged, so agents follow the same rules as the
 * page import.
 *
 * @category tools
 * @since 0.1.0
 */
export const tool = Tool.make("create_recipe", {
  description: [
    "Create a saved Goho recipe from a title, ingredients, and steps the user supplied, with no source or photo. Each call saves a new recipe, even when one already has that title. Keep quantities exact, and leave out the yield or total time when it isn't known rather than guessing. Use fictional recipe details only when the user asks for an example.",
    `Write the sections and steps by these rules, shared with every other recipe Goho saves:\n${recipeWritingGuidance}`,
    [
      "Ingredients stay one list for the whole recipe; ingredient marks in any section point at it. Write each step as ordered segments. Use ingredient marks for ingredients, not just plain text, so Goho can link and highlight them. Each ingredient needs a unique id within this recipe; a mark's ingredientId must match that id exactly.",
      'For example, with an ingredient whose id is "butter", a recipe with one untitled section whose only step uses all of it has {"sections":[{"title":null,"steps":[{"segments":[{"kind":"text","text":"Melt "},{"kind":"mark","content":{"kind":"ingredient","ingredientId":"butter","portion":{"numerator":1,"denominator":1}}},{"kind":"text","text":" in a pan."}]}]}]}.',
      "The portion is the fraction of that ingredient's recipe quantity used in this step, not the quantity itself: 1/1 means all and 1/2 means half. It must be greater than zero and no greater than one. An ingredient mark displays the computed amount and ingredient name, replacing both in the step; do not repeat either as plain text. Put the spaces and punctuation around a mark in the text segments beside it.",
      'When the recipe gives no way to work out a step\'s portion, do not guess: write that reference as a text mark, for example {"kind":"mark","content":{"kind":"text","text":"some of the sugar"}}. A text mark highlights literal wording but does not link to an ingredient; use content.kind "ingredient" when the portion is known. Steps that add no ingredient may use text segments alone.',
    ].join(" "),
  ].join("\n\n"),
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
