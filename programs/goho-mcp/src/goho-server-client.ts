import * as Client from "@goho/goho-server-client/client";
import { Config, Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

type ClientShape = Effect.Success<ReturnType<typeof Client.make>>;

/**
 * Configured HTTP client for the local Goho server.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, ClientShape>()(
  "@goho/goho-mcp/GohoServerClient",
) {}

/**
 * Builds the Goho client from its URL and the fetch transport.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Config.String("GOHO_SERVER_URL").pipe(
    Config.withDefault("http://127.0.0.1:3000"),
    Effect.flatMap(Client.make),
  ),
).pipe(Layer.provide(FetchHttpClient.layer));
