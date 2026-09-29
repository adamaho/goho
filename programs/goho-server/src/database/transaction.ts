import { Context, Effect, identity, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The database could not begin, commit, or roll back a transaction.
 *
 * @category errors
 * @since 0.1.0
 */
export class TransactionError extends Schema.TaggedError<TransactionError>()(
  "GohoServer.Database.TransactionError",
  { cause: Schema.Defect() },
) {}

/**
 * Runs an effect's database work atomically.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly run: <A, E, R>(
    self: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | TransactionError, R>;
}

/**
 * Transaction boundary for workflows that span several repositories. Repository
 * queries inside `run` join the transaction; nested transactions become savepoints.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/Transaction",
) {}

/**
 * Runs transactions on the shared SQL client.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return Service.of({
      run: (self) =>
        sql
          .withTransaction(self)
          .pipe(
            Effect.catchTag("SqlError", (cause) => Effect.fail(new TransactionError({ cause }))),
          ),
    });
  }),
);

/**
 * Runs effects without a transaction for tests that fake every repository.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerTest = Layer.succeed(Service, Service.of({ run: identity }));
