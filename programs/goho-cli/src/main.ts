#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { ConfigProvider, Console, Effect } from "effect";
import { CliOutput, Command } from "effect/cli";

import { booksCommand } from "./commands/books.ts";
import { receiptsCommand } from "./commands/receipts.ts";
import { recipesCommand } from "./commands/recipes.ts";
import { statusCommand } from "./commands/status.ts";
import { getProblem } from "./errors.ts";

const command = Command.make("goho").pipe(
  Command.withDescription("Command-line interface for Goho"),
  Command.withSubcommands([receiptsCommand, booksCommand, recipesCommand, statusCommand]),
);

// An empty GOHO_SERVER_URL is a configuration error, not a request for the default.
const configProvider = ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }));

// Invalid invocations print only the JSON error below, not help.
const presenter = CliOutput.layerPresenter({
  present: (event) =>
    event._tag === "InvalidInvocation" ? Effect.void : CliOutput.defaultPresenter.present(event),
});

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.catchCause((cause) =>
    getProblem(cause).pipe(
      Effect.flatMap((problem) =>
        problem === undefined
          ? Effect.failCause(cause)
          : Console.error(JSON.stringify(problem, null, 2)).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  process.exitCode = 1;
                }),
              ),
            ),
      ),
    ),
  ),
  Effect.provide([configProvider, presenter, NodeServices.layer]),
  NodeRuntime.runMain,
);
