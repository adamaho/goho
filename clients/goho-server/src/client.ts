import { HttpApiClient } from "effect/unstable/httpapi";

import { api } from "./api.ts";

/**
 * Derives the Goho client from its HTTP API contract.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (baseUrl: string) => HttpApiClient.make(api, { baseUrl });
