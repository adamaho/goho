#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { receiptsCommand, receiptsLayer } from "./commands/receipts.ts";

const command = Command.make("goho").pipe(
  Command.withDescription("Command-line interface for Goho"),
  Command.withSubcommands([receiptsCommand]),
);

const MainLive = Layer.merge(NodeServices.layer, receiptsLayer);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.catchTag("GohoCli.CommandError", (error) =>
    Console.error(error.message).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
  // @effect-diagnostics strictEffectProvide:off -- this is the application entry point
  Effect.provide(MainLive),
  // @effect-diagnostics strictEffectProvide:on
  NodeRuntime.runMain,
);
