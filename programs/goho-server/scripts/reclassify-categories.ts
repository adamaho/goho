import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Layer, Schema } from "effect";

import * as CategoryRepository from "#src/categories/repository.ts";
import * as Database from "#src/database/client.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as Reclassification from "#src/receipts/reclassification.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import * as Ai from "#src/services/ai.ts";

class ReclassificationCommandError extends Schema.TaggedError<ReclassificationCommandError>()(
  "GohoServer.ReclassificationCommandError",
  { message: Schema.String },
) {}

// Previews by default; only an explicit --apply saves category changes.
const apply = process.argv.includes("--apply");

const RepositoriesLive = ReceiptRepository.layer.pipe(
  Layer.provideMerge(CategoryRepository.layer),
  Layer.merge(Transaction.layer),
  Layer.provide(Database.layer),
);

Effect.gen(function* () {
  const outcomes = yield* Reclassification.run({ apply });
  yield* Console.log(JSON.stringify({ apply, receipts: outcomes }, null, 2));
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  if (failed > 0) {
    return yield* new ReclassificationCommandError({
      message: `${failed} receipts failed and saved nothing; see the report above.`,
    });
  }
}).pipe(Effect.provide(Layer.merge(RepositoriesLive, Ai.layer)), NodeRuntime.runMain);
