#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Postgres } from "@goho/core";
import { Config, Console, Effect, FileSystem, Result, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { SqlError } from "effect/sql";

import { planImport } from "./plan.ts";
import { renderPlan } from "./report.ts";
import { insertReceipts } from "./writer.ts";

class CommandError extends Schema.TaggedError<CommandError>()("RawCsvImporter.CommandError", {
  message: Schema.String,
}) {}

// Read only after validation passes, so dry runs never need database settings.
const DatabaseLive = Postgres.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
  applicationName: Config.succeed("goho-raw-csv-importer"),
  maxConnections: Config.succeed(1),
});

// A lost connection cannot prove whether COMMIT reached the server, so only
// statement failures claim a rollback. Nothing is retried.
const describeWriteFailure = (cause: unknown) => {
  if (SqlError.isSqlError(cause) && cause.reason._tag === "ConnectionError") {
    return `Database connection failed: ${cause.message}. No commit was confirmed; check the target database before running --apply again.`;
  }
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `Import failed and was rolled back; nothing was written. Cause: ${detail}`;
};

const apply = Effect.fn("@goho/RawCsvImporter.apply")(function* (
  receipts: Parameters<typeof insertReceipts>[0],
) {
  const inserted = yield* insertReceipts(receipts).pipe(
    Effect.provide(DatabaseLive),
    Effect.catchTags({
      ConfigError: () =>
        Effect.fail(new CommandError({ message: "DATABASE_URL is required with --apply." })),
      SqlError: (error) => Effect.fail(new CommandError({ message: describeWriteFailure(error) })),
      "RawCsvImporter.WriteError": (error) =>
        Effect.fail(new CommandError({ message: describeWriteFailure(error.cause) })),
    }),
  );
  yield* Console.log(
    `Inserted ${inserted.receipts} receipts with ${inserted.items} items in one transaction. Running --apply again inserts duplicates.`,
  );
});

const command = Command.make("goho-import-raw-csv", {
  file: Flag.String("file").pipe(
    Flag.withDescription("Path to a local RAW CSV export with the store,date,... header."),
  ),
  apply: Flag.Boolean("apply").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Insert the validated receipts into DATABASE_URL in one transaction."),
  ),
}).pipe(
  Command.withDescription(
    "Preview historical RAW CSV receipts, or insert them with --apply. Defaults to an offline dry run.",
  ),
  Command.withHandler(({ file, apply: shouldApply }) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const text = yield* fileSystem
        .readFileString(file)
        .pipe(
          Effect.mapError(
            () => new CommandError({ message: `RAW CSV file could not be read: ${file}` }),
          ),
        );
      const planned = planImport(text);
      if (Result.isFailure(planned)) {
        return yield* new CommandError({
          message: `${planned.failure.message}\nImport blocked: the CSV could not be read reliably. Nothing was written.`,
        });
      }
      const plan = planned.success;
      yield* Console.log(renderPlan(plan, { file }));
      if (plan.errors.length > 0) {
        return yield* new CommandError({
          message: `Import blocked: ${plan.errors.length} validation errors must be fixed. Nothing was written.`,
        });
      }
      if (!shouldApply) {
        yield* Console.log(
          "Dry run: the CSV is importable. Nothing was written; re-run with --apply to insert.",
        );
        return;
      }
      yield* apply(plan.receipts);
    }),
  ),
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.catchTag("RawCsvImporter.CommandError", (error) =>
    Console.error(error.message).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
