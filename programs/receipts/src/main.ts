#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { processCommand } from "./commands/process.ts";

const command = Command.make("receipts").pipe(
  Command.withDescription("Processes receipts from Google services"),
  Command.withSubcommands([processCommand]),
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
