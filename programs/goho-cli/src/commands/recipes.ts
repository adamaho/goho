import { RecipeId } from "@goho/goho-server-client/recipes";
import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import * as GohoServer from "#src/goho-server.ts";
import { DeleteResult } from "#src/response.ts";

import { imageCommand } from "./recipe-image.ts";
import { uploadsCommand } from "./recipe-uploads.ts";

const listCommand = Command.make("list").pipe(
  Command.withDescription("List every saved recipe's headline details."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.recipes.list();
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

const viewCommand = Command.make("view", {
  recipeId: Argument.String("recipe-id").pipe(
    Argument.withSchema(RecipeId),
    Argument.withDescription("Positive integer ID of the persisted recipe to view."),
  ),
}).pipe(
  Command.withDescription("View one persisted recipe with its ingredients and steps."),
  Command.withHandler(({ recipeId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.recipes.get({ params: { recipeId } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

const deleteCommand = Command.make("delete", {
  recipeId: Argument.String("recipe-id").pipe(
    Argument.withSchema(RecipeId),
    Argument.withDescription("Positive integer ID of the persisted recipe to delete."),
  ),
}).pipe(
  Command.withDescription("Permanently delete one persisted recipe, its imports, and its photo."),
  Command.withHandler(({ recipeId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      yield* client.recipes.delete({ params: { recipeId } });
      const result = yield* DeleteResult.makeEffect({
        deleted: true,
        resource: "recipe",
        id: recipeId,
      });
      yield* Console.log(JSON.stringify(result, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Command group for recipe retrieval, photo downloads, deletion, and imports from web pages.
 *
 * @category commands
 * @since 0.1.0
 */
export const recipesCommand = Command.make("recipes").pipe(
  Command.withDescription("Manage recipes"),
  Command.withSubcommands([listCommand, viewCommand, imageCommand, deleteCommand, uploadsCommand]),
);
