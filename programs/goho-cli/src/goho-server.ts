import * as Client from "@goho/goho-server-client/client";
import { Config, Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { CommandError } from "#src/errors.ts";

type ClientShape = Effect.Success<ReturnType<typeof Client.make>>;

/**
 * Configured Goho server client shared by CLI commands.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, ClientShape>()(
  "@goho/goho-cli/GohoServerClient",
) {}

/**
 * Builds the Goho server client from CLI configuration and the fetch transport.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Config.string("GOHO_SERVER_URL").pipe(
    Config.withDefault("http://127.0.0.1:3000"),
    Effect.flatMap(Client.make),
    Effect.mapError(
      (cause) =>
        new CommandError({
          message: "Invalid CLI configuration. Check GOHO_SERVER_URL.",
          cause,
        }),
    ),
  ),
).pipe(Layer.provide(FetchHttpClient.layer));
