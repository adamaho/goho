import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";

import * as GohoServer from "#src/goho-server.ts";

import { makeCreateRecipeRequest } from "./recipe-create-input.ts";

/**
 * Saves one recipe from flags and prints it. Every call saves a new recipe, even
 * with a title already saved, and the recipe has no source or photo.
 *
 * @category commands
 * @since 0.1.0
 */
export const createCommand = Command.make("create", {
  title: Flag.String("title").pipe(Flag.withDescription("Recipe title.")),
  ingredients: Flag.String("ingredient").pipe(
    Flag.withDescription(
      "Ingredient as id=<id>,name=<text>,quantity=<amount>,unit=<unit>, or quantity=<wording> without a unit; repeat in recipe order. Amounts are 2, 1/2, 0.5, 2..3, or text:<wording>. Write commas in values as \\,.",
    ),
    Flag.atLeast(1),
  ),
  steps: Flag.String("step").pipe(
    Flag.withDescription(
      "Step text with optional marks {{ingredient=<id>}}, {{ingredient=<id>,portion=1/2}}, or {{text=<wording>}}; repeat in order. Write a literal {{ as \\{{.",
    ),
    Flag.atLeast(1),
  ),
  recipeYield: Flag.String("yield").pipe(
    Flag.withDescription("How much it makes, as quantity=<amount>,label=<text>, if known."),
    Flag.optional,
  ),
  totalTimeSeconds: Flag.String("total-time-seconds").pipe(
    Flag.withDescription("Total time as a whole number of seconds, if known."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Save one new recipe with its ingredients and steps."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const payload = yield* makeCreateRecipeRequest(flags);
      const client = yield* GohoServer.Service;
      const response = yield* client.recipes.create({ payload });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);
