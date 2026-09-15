#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { receiptsCommand } from "./commands/receipts.ts";
import * as GohoServer from "./goho-server.ts";

const command = Command.make("goho").pipe(
  Command.withDescription("Command-line interface for Goho"),
  Command.withSubcommands([receiptsCommand]),
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(GohoServer.layer),
  Effect.catchTag("GohoCli.CommandError", (error) =>
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
