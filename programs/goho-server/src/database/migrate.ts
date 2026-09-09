import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";

import * as Database from "./client.ts";
import * as Migrations from "./migrations.ts";

class MigrationCommandError extends Schema.TaggedError<MigrationCommandError>()(
  "@goho/GohoServer.Database.MigrationCommandError",
  { message: Schema.String },
) {}

Migrations.run().pipe(
  Effect.tap((applied) => Effect.logInfo("Database migrations applied", { count: applied.length })),
  Effect.provide(Layer.merge(Database.layer, NodeServices.layer)),
  Effect.catch((error) =>
    Effect.logError("Database migration failed", { errorType: error._tag }).pipe(
      Effect.andThen(
        Effect.fail(
          new MigrationCommandError({
            message: "Database migration failed; verify configuration and schema",
          }),
        ),
      ),
    ),
  ),
  NodeRuntime.runMain,
);

