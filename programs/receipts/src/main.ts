import { Effect, Layer } from "effect";

import { AiLive } from "./services/ai.ts";
import { GoogleAuthLive } from "./services/auth.ts";

import { GoogleAuth } from "@goho/lib-core";

const program = Effect.fn("Receipts.program")(function* () {
  const googleAuth = yield* GoogleAuth.Service;

  yield* googleAuth.authenticate;
  yield* Effect.logInfo("Receipts program authenticated with Google");
});

const MainLive = Layer.merge(GoogleAuthLive, AiLive);

await program().pipe(Effect.provide(MainLive), Effect.runPromise);
