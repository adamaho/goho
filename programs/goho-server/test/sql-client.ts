import { Effect, Layer, Stream } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import { SqlClient, type SqlConnection, Statement } from "effect/unstable/sql";

// Unit tests fake repositories, so only transaction control reaches this connection.
const unexpectedQuery = () => Effect.die("Unexpected SQL query in a unit test");
const connection: SqlConnection.Connection = {
  execute: unexpectedQuery,
  executeRaw: unexpectedQuery,
  executeStream: () => Stream.die("Unexpected SQL query in a unit test"),
  executeValues: unexpectedQuery,
  executeValuesUnprepared: unexpectedQuery,
  executeUnprepared: (sql) =>
    sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK"
      ? Effect.succeed([])
      : unexpectedQuery(),
};

/**
 * SQL client for fake-repository tests that rejects application queries.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  SqlClient.SqlClient,
  SqlClient.make({
    acquirer: Effect.succeed(connection),
    compiler: Statement.makeCompilerSqlite(),
    spanAttributes: [],
  }),
).pipe(Layer.provide(Reactivity.layer));
