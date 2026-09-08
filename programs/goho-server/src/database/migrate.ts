import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";

import * as Database from "./client.ts";
import * as Migrations from "./migrations.ts";

Migrations.run().pipe(
  Effect.tap((applied) => Effect.logInfo("Database migrations applied", { count: applied.length })),
  Effect.provide(Layer.merge(Database.layer, NodeServices.layer)),
  Effect.catch((error) =>
    Effect.logError("Database migration failed", { errorType: error._tag }).pipe(
      Effect.andThen(
        Effect.fail(new Error("Database migration failed; verify configuration and schema")),
      ),
    ),
  ),
  NodeRuntime.runMain,
);
