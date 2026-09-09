import { PgMigrator } from "@effect/sql-pg";
import { Effect } from "effect";

import receipts from "./migrations/0001-receipts.ts";

/**
 * Explicit migration registry, shared by the migration command and tests.
 *
 * @category models
 * @since 0.1.0
 */
export const run = Effect.fn("Database.Migrations.run")(function* () {
  return yield* PgMigrator.run({
    loader: PgMigrator.fromRecord({ "0001_receipts": receipts }),
    table: "goho_migrations",
  });
});
