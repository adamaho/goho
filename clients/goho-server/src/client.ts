import { Effect, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { api } from "./api.ts";

/**
 * Creates a typed client from the shared API without mutation retries.
 *
 * @category models
 * @since 0.1.0
 */
export const make = Effect.fn("GohoServerClient.make")(function* (
  baseUrl: string,
  token: Redacted.Redacted<string>,
) {
  return yield* HttpApiClient.make(api, {
    baseUrl,
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
});
