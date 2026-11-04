import { Console, Effect } from "effect";
import { Command } from "effect/cli";

import { CommandError, getRequestErrorCode } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

/**
 * Checks that the configured Goho server is responding.
 *
 * @category commands
 * @since 0.1.0
 */
export const statusCommand = Command.make("status").pipe(
  Command.withDescription("Check that the Goho server is responding."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.health.check();
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            code: getRequestErrorCode(cause),
            message: "Server status could not be retrieved. Check that the server is running.",
            cause,
          }),
      ),
    ),
  ),
);
