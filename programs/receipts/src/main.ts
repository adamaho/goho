#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { AiLive } from "./services/ai.ts";
import { GoogleAuthLive } from "./services/auth.ts";

import { GoogleAuth } from "@goho/lib-core";

const program = Effect.fn("Receipts.program")(function* () {
  const googleAuth = yield* GoogleAuth.Service;

  yield* googleAuth.authenticate;
  yield* Effect.logInfo("Receipts program authenticated with Google");
});

const MainLive = Layer.merge(GoogleAuthLive, AiLive);

const process = Command.make("process").pipe(
  Command.withDescription("Runs one receipt-processing pass"),
  Command.withHandler(() => program().pipe(Effect.provide(MainLive))),
);

const command = Command.make("receipts").pipe(
  Command.withDescription("Processes receipts from Google services"),
  Command.withSubcommands([process]),
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
