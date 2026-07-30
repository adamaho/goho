import { GoogleAuth } from "@goho/lib-core";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { AiLive } from "../services/ai.ts";
import { GoogleAuthLive } from "../services/auth.ts";

const ProcessLive = Layer.merge(GoogleAuthLive, AiLive);

const process = Effect.fn("Receipts.process")(function* () {
  const googleAuth = yield* GoogleAuth.Service;

  yield* googleAuth.authenticate;
  yield* Effect.logInfo("Receipts program authenticated with Google");
});

export const processCommand = Command.make("process").pipe(
  Command.withDescription("Process all receipts in the 'todo' google drive folder."),
  Command.withHandler(() => process().pipe(Effect.provide(ProcessLive))),
);
