import { it } from "@effect/vitest";
import { CreateReceiptRequest, IdempotencyKey } from "@goho/goho-server-client/receipts";
import { Deferred, Effect, Fiber, Ref, Result } from "effect";
import { expect } from "vitest";

import * as Repository from "../../src/receipts/repository.ts";
import { make, makeCreate } from "../../src/receipts/service.ts";

const request = { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 1 };
const idempotencyKey = IdempotencyKey.make("manual-entry-1");
const receipt = CreateReceiptRequest.make({
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  category: "Groceries",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: null,
  items: [{ name: "Apples", amount: "11" }],
});

it.effect("maps idempotency conflicts onto the public conflict error", () =>
  Effect.gen(function* () {
    const create = makeCreate({
      create: () => new Repository.IdempotencyConflict({ idempotencyKey }),
    });
    const result = yield* create(idempotencyKey, receipt).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("Conflict");
  }),
);

it.effect("redacts receipt persistence failures", () =>
  Effect.gen(function* () {
    const create = makeCreate({
      create: () =>
        new Repository.PersistenceError({
          operation: "create",
          cause: "private database details",
        }),
    });
    const result = yield* create(idempotencyKey, receipt).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("InternalServerError");
    expect(JSON.stringify(result)).not.toContain("private database details");
  }),
);

it.effect("rejects overlap and releases the lock after a successful batch", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const service = yield* make(() =>
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
        Effect.as([]),
      ),
    );
    const first = yield* service.process(request).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    const overlapping = yield* Effect.result(service.process(request));
    expect(Result.isFailure(overlapping) && overlapping.failure._tag).toBe("Conflict");
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(first)).toEqual([]);
    expect(yield* service.process(request)).toEqual([]);
  }),
);

it.effect("redacts batch errors and releases the lock after failure", () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0);
    const service = yield* make(() =>
      Ref.getAndUpdate(calls, (n) => n + 1).pipe(
        Effect.flatMap((n) =>
          n === 0 ? Effect.die("private upstream details") : Effect.succeed([]),
        ),
      ),
    );
    const failed = yield* Effect.result(service.process(request));
    expect(Result.isFailure(failed) && failed.failure._tag).toBe("InternalServerError");
    expect(JSON.stringify(failed)).not.toContain("private upstream details");
    expect(yield* service.process(request)).toEqual([]);
  }),
);

it.effect("omits diagnostic causes from failed and stranded public results", () =>
  Effect.gen(function* () {
    const service = yield* make(() =>
      Effect.succeed([
        {
          _tag: "Failed",
          fileId: "1",
          fileName: "receipt",
          stage: "ParseReceipt",
          disposition: "MovedToFailed",
          cause: "secret",
        },
        {
          _tag: "Stranded",
          fileId: "2",
          fileName: "receipt",
          stage: "Complete",
          cause: "secret",
          compensationCause: "other secret",
        },
      ]),
    );
    const results = yield* service.process(request);
    expect(results).toEqual([
      {
        _tag: "Failed",
        fileId: "1",
        fileName: "receipt",
        stage: "ParseReceipt",
        disposition: "MovedToFailed",
      },
      { _tag: "Stranded", fileId: "2", fileName: "receipt", stage: "Complete" },
    ]);
  }),
);

it.effect("keeps the lock until work finishes after client interruption", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const service = yield* make(() =>
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
        Effect.as([]),
      ),
    );
    const first = yield* service.process(request).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    const interrupt = yield* Fiber.interrupt(first).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    const overlapping = yield* Effect.result(service.process(request));
    expect(Result.isFailure(overlapping) && overlapping.failure._tag).toBe("Conflict");
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(interrupt);
    expect(yield* service.process(request)).toEqual([]);
  }),
);
