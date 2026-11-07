import * as Client from "@goho/goho-server-client/client";
import { Config, Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

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

const isHttpUrl = (value: string) => {
  const protocol = URL.parse(value)?.protocol;
  return protocol === "http:" || protocol === "https:";
};

/**
 * Builds the Goho server client from CLI configuration and the fetch transport.
 * `GOHO_SERVER_URL` must be an absolute http or https URL; it is passed to the
 * client as written, so base paths keep working.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const url = yield* Config.String("GOHO_SERVER_URL").pipe(
      Config.withDefault("http://127.0.0.1:3000"),
    );
    if (!isHttpUrl(url)) return yield* Effect.fail(url);
    return yield* Client.make(url);
  }).pipe(
    Effect.mapError(
      () =>
        new CommandError({
          type: "goho:cli:configuration-error",
          detail:
            "Set GOHO_SERVER_URL to an absolute http or https URL, such as http://127.0.0.1:3000.",
        }),
    ),
  ),
).pipe(Layer.provide(FetchHttpClient.layer));
