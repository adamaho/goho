import { Deferred, Effect, Fiber } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Holds `first` in an open transaction until `second`, on another connection,
 * waits on one of its locks in a statement containing `statement`. Then commits
 * and returns both results.
 *
 * @category testing
 * @since 0.1.0
 */
export const behindOpenTransaction = <A, B, E1, E2>(
  first: Effect.Effect<A, E1, SqlClient.SqlClient>,
  second: Effect.Effect<B, E2>,
  statement: string,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const ready = yield* Deferred.make<A>();
    const release = yield* Deferred.make<void>();
    const holder = yield* sql
      .withTransaction(
        first.pipe(
          Effect.tap((value) => Deferred.succeed(ready, value)),
          Effect.tap(() => Deferred.await(release)),
        ),
      )
      .pipe(Effect.forkChild);
    const held = yield* Deferred.await(ready);
    // Forked outside the transaction, so it runs on its own connection.
    const waiter = yield* second.pipe(Effect.forkChild);
    yield* sql<{ waiting: number }>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()
        AND query LIKE ${`%${statement}%`}
    `.pipe(Effect.repeat({ until: ([row]) => (row?.waiting ?? 0) > 0 }));
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(holder);
    return [held, yield* Fiber.join(waiter)] as const;
  });
