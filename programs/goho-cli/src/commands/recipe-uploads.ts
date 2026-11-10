import { RecipeUploadId } from "@goho/goho-server-client/recipe-uploads";
import { RecipeUrl } from "@goho/goho-server-client/recipes";
import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import * as GohoServer from "#src/goho-server.ts";
import { DeleteResult } from "#src/response.ts";

/**
 * Queues one recipe import from a web page URL. The server fetches the page later.
 *
 * @category commands
 * @since 0.1.0
 */
const createCommand = Command.make("create", {
  url: Argument.String("url").pipe(
    Argument.withSchema(RecipeUrl),
    Argument.withDescription("Absolute http or https URL of the recipe page."),
  ),
}).pipe(
  Command.withDescription("Queue one recipe import from a web page."),
  Command.withHandler(({ url }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.recipeUploads.create({
        payload: { source: { kind: "url", url } },
      });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Lists every recipe import and its current processing status.
 *
 * @category commands
 * @since 0.1.0
 */
const listCommand = Command.make("list").pipe(
  Command.withDescription("List all recipe imports and their processing status."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.recipeUploads.list();
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Retrieves the durable processing status of one recipe import.
 *
 * @category commands
 * @since 0.1.0
 */
const viewCommand = Command.make("view", {
  uploadId: Argument.String("upload-id").pipe(
    Argument.withSchema(RecipeUploadId),
    Argument.withDescription("UUID returned when the recipe import was queued."),
  ),
}).pipe(
  Command.withDescription("Show the processing status of one recipe import."),
  Command.withHandler(({ uploadId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.recipeUploads.get({ params: { uploadId } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Deletes one failed recipe import.
 *
 * @category commands
 * @since 0.1.0
 */
const deleteCommand = Command.make("delete", {
  uploadId: Argument.String("upload-id").pipe(
    Argument.withSchema(RecipeUploadId),
    Argument.withDescription("UUID of the failed recipe import to delete."),
  ),
}).pipe(
  Command.withDescription("Permanently delete one failed recipe import."),
  Command.withHandler(({ uploadId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      yield* client.recipeUploads.delete({ params: { uploadId } });
      const result = yield* DeleteResult.makeEffect({
        deleted: true,
        resource: "recipe-upload",
        id: uploadId,
      });
      yield* Console.log(JSON.stringify(result, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Groups recipe import creation, listing, viewing, and failed-import deletion.
 *
 * @category commands
 * @since 0.1.0
 */
export const uploadsCommand = Command.make("uploads").pipe(
  Command.withDescription("Manage recipe imports from web pages and their processing status."),
  Command.withSubcommands([createCommand, listCommand, viewCommand, deleteCommand]),
);
