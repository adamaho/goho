import { RecipeId } from "@goho/goho-server-client/recipes";
import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import * as GohoServer from "#src/goho-server.ts";
import { saveImageFile } from "#src/utils/save-image-file.ts";

/**
 * Saves one recipe's stored photo to a file and describes the saved file.
 *
 * @category commands
 * @since 0.1.0
 */
export const imageCommand = Command.make("image", {
  recipeId: Argument.String("recipe-id").pipe(
    Argument.withSchema(RecipeId),
    Argument.withDescription("Positive integer ID of the persisted recipe."),
  ),
  output: Flag.String("output").pipe(
    Flag.withDescription("File to save to. Defaults to recipe-<id> with the image's extension."),
    Flag.optional,
  ),
}).pipe(
  Command.withDescription("Save one recipe's stored photo to a file."),
  Command.withHandler(({ recipeId, output }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.recipes.getImage({ params: { recipeId } });
      const saved = yield* saveImageFile({
        label: "Recipe photo",
        defaultName: `recipe-${recipeId}`,
        bytes: response.body,
        contentType: response.headers["content-type"],
        output,
      });
      yield* Console.log(JSON.stringify(saved, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);
