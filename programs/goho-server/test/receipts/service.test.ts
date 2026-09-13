import { it } from "@effect/vitest";
import { GoogleDrive } from "@goho/core";
import { Deferred, Effect, Fiber, Layer, Ref, Result } from "effect";
import { expect } from "vitest";

import * as Receipts from "#src/receipts/service.ts";

import * as ReceiptDependencies from "./dependencies.ts";

const request = { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 1 };
const receiptLayer = (googleDrive: Partial<GoogleDrive.Interface>) =>
  Receipts.layer.pipe(Layer.provide(ReceiptDependencies.layer({ googleDrive })));

it.effect("rejects overlap and releases the lock after a successful batch", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const service = yield* Receipts.Service.pipe(
      Effect.provide(
        receiptLayer({
          listFiles: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as([]),
            ),
        }),
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
    const service = yield* Receipts.Service.pipe(
      Effect.provide(
        receiptLayer({
          listFiles: () =>
            Ref.getAndUpdate(calls, (n) => n + 1).pipe(
              Effect.flatMap((n) =>
                n === 0 ? Effect.die("private upstream details") : Effect.succeed([]),
              ),
            ),
        }),
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
    const service = yield* Receipts.Service.pipe(
      Effect.provide(
        receiptLayer({
          listFiles: () =>
            Effect.succeed([
              { id: "1", name: "receipt", mimeType: "text/plain" },
              { id: "2", name: "receipt", mimeType: "text/plain" },
            ]),
          moveFile: ({ fileId, destinationFolderId }) =>
            fileId === "2" && destinationFolderId === "failed"
              ? Effect.fail(
                  new GoogleDrive.DriveError({
                    operation: "moveFile",
                    message: "private compensation details",
                  }),
                )
              : Effect.succeed({ id: fileId, name: "receipt", mimeType: "text/plain" }),
        }),
      ),
    );
    const results = yield* service.process(request);
    expect(results).toEqual([
      {
        _tag: "Failed",
        fileId: "1",
        fileName: "receipt",
        stage: "ValidateFile",
        disposition: "MovedToFailed",
      },
      { _tag: "Stranded", fileId: "2", fileName: "receipt", stage: "ValidateFile" },
    ]);
    expect(JSON.stringify(results)).not.toContain("private compensation details");
    expect(JSON.stringify(results)).not.toContain("Unsupported receipt image");
  }),
);

it.effect("keeps the lock until work finishes after client interruption", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const service = yield* Receipts.Service.pipe(
      Effect.provide(
        receiptLayer({
          listFiles: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as([]),
            ),
        }),
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
