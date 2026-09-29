import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";

/**
 * Runs a database workflow on one transaction-bound connection.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly run: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
}

/**
 * Transaction boundary for application workflows.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/Transaction",
) {}

/**
 * Provides transaction boundaries using the shared SQL client.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return Service.of({ run: (effect) => sql.withTransaction(effect) });
  }),
);
