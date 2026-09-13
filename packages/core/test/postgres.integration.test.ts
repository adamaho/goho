import { PgClient } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Config, Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Postgres from "#src/database/postgres.ts";

const DatabaseLive = Postgres.layerConfig({
  url: Config.redacted("TEST_DATABASE_URL"),
  maxConnections: Config.succeed(1),
});

it.effect("provides SQL and Postgres services and reuses a single pooled connection", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const pg = yield* PgClient.PgClient;
    // PgClient.layer registers one client under both service keys; consumers share its pool.
    expect(pg).toBe(sql);
    const decode = Schema.decodeUnknownEffect(
      Schema.Array(Schema.Struct({ value: Schema.String, pid: Schema.Int })),
    );
    const first =
      yield* sql`SELECT ${"receipt ' value"}::text AS value, pg_backend_pid() AS pid`.pipe(
        Effect.flatMap(decode),
      );
    const second =
      yield* sql`SELECT ${"receipt ' value"}::text AS value, pg_backend_pid() AS pid`.pipe(
        Effect.flatMap(decode),
      );
    expect(first).toEqual(second);
    expect(first.at(0)?.value).toBe("receipt ' value");
  }).pipe(Effect.provide(DatabaseLive)),
);
