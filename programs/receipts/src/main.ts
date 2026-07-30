import { Effect } from "effect";

import { GoogleAuthLive } from "./services/google-auth.ts";

import { GoogleAuth } from "@goho/lib-core";

const program = Effect.fn("Receipts.program")(function* () {
  const googleAuth = yield* GoogleAuth.Service;

  yield* googleAuth.authenticate;
  yield* Effect.logInfo("Receipts program authenticated with Google");
});

await program().pipe(Effect.provide(GoogleAuthLive), Effect.runPromise);
