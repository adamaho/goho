import { it } from "@effect/vitest";
import { Ai } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { type CreateReceiptRequest, ReceiptId } from "@goho/goho-api/receipts";
import { Effect, Fiber, Layer, Ref, Schema } from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import { FileId } from "#src/file-storage.ts";
import type { ReceiptExtraction, ReceiptUpload } from "#src/receipt-uploads/model.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as Worker from "#src/receipt-uploads/worker.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import { parsedReceipt } from "#test/receipts/fixtures.ts";

const upload: ReceiptUpload = {
  id: ReceiptUploadId.make("7d89d8f7-6f0c-4df2-a2a9-94771638ac99"),
  fileId: FileId.make("drive-file"),
  fileName: "receipt.png",
  contentType: "image/png",
  status: "processing",
  receiptId: null,
  failureCode: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const dependencies = (options: {
  readonly currency?: string;
  readonly insertReceipt?: ReceiptRepository.Interface["insert"];
  readonly storageGet?: FileStorage.Interface["get"];
  readonly markProcessing?: ReceiptUploadRepository.Interface["markProcessing"];
  readonly markSucceeded?: ReceiptUploadRepository.Interface["markSucceeded"];
  readonly markFailed?: ReceiptUploadRepository.Interface["markFailed"];
}) =>
  Layer.mergeAll(
    Transaction.layerTest,
    Layer.succeed(FileStorage.Service, {
      put: () => Effect.die("Unexpected storage.put call"),
      get: options.storageGet ?? (() => Effect.succeed(new Uint8Array([1, 2, 3]))),
      delete: () => Effect.die("Unexpected storage.delete call"),
    }),
    Layer.succeed(Ai.Service, {
      generateObject: ({ schema }) =>
        Schema.decodeUnknownEffect(schema)({
          ...parsedReceipt,
          transaction: { ...parsedReceipt.transaction, currency: options.currency ?? "CAD" },
        }).pipe(Effect.orDie),
    }),
    Layer.succeed(ReceiptRepository.Service, {
      findById: () => Effect.succeedNone,
      insert: options.insertReceipt ?? (() => Effect.succeed(ReceiptId.make("42"))),
      list: Effect.succeed([]),
    }),
    Layer.succeed(ReceiptUploadRepository.Service, {
      list: Effect.succeed([]),
      createQueued: () => Effect.die("Unexpected createQueued call"),
      findById: () => Effect.succeedSome(upload),
      findByReceiptId: () => Effect.succeedNone,
      markProcessing: options.markProcessing ?? (() => Effect.succeed(upload)),
      markSucceeded:
        options.markSucceeded ??
        ((_, receiptId) => Effect.succeed({ ...upload, status: "succeeded", receiptId })),
      markFailed:
        options.markFailed ??
        ((_, failureCode) => Effect.succeed({ ...upload, status: "failed", failureCode })),
    }),
  );

it.effect("stores the resulting receipt ID after processing an upload", () =>
  Effect.gen(function* () {
    const succeeded = yield* Ref.make<ReadonlyArray<string>>([]);
    const receipts = yield* Ref.make<ReadonlyArray<CreateReceiptRequest>>([]);
    const extractions = yield* Ref.make<ReadonlyArray<ReceiptExtraction>>([]);
    yield* Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 1 }).pipe(
      Effect.provide(
        dependencies({
          currency: "USD",
          insertReceipt: (receipt) =>
            Ref.update(receipts, (values) => [...values, receipt]).pipe(
              Effect.as(ReceiptId.make("42")),
            ),
          markSucceeded: (uploadId, receiptId, extraction) =>
            Ref.update(succeeded, (values) => [...values, `${uploadId}:${receiptId}`]).pipe(
              Effect.andThen(Ref.update(extractions, (values) => [...values, extraction])),
              Effect.as({ ...upload, status: "succeeded", receiptId }),
            ),
        }),
      ),
    );
    expect(yield* Ref.get(succeeded)).toEqual([`${upload.id}:42`]);
    expect((yield* Ref.get(receipts)).map((receipt) => receipt.currency)).toEqual(["USD"]);
    expect(yield* Ref.get(extractions)).toEqual([
      {
        version: 2,
        payload: {
          ...parsedReceipt,
          transaction: { ...parsedReceipt.transaction, currency: "USD" },
        },
      },
    ]);
  }),
);

it.effect("discards a redelivered job for an upload that already finished", () =>
  Effect.gen(function* () {
    const succeeded = yield* Ref.make(0);
    yield* Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 1 }).pipe(
      Effect.provide(
        dependencies({
          storageGet: () => Effect.die("Unexpected storage.get call"),
          markProcessing: (uploadId) =>
            Effect.fail(
              new ReceiptUploadRepository.InvalidTransition({
                uploadId,
                currentStatus: "succeeded",
                requestedStatus: "processing",
              }),
            ),
          markSucceeded: () => Ref.update(succeeded, (count) => count + 1).pipe(Effect.as(upload)),
        }),
      ),
    );
    expect(yield* Ref.get(succeeded)).toBe(0);
  }),
);

it.effect("records a stable failure code only after the final attempt", () =>
  Effect.gen(function* () {
    const failures = yield* Ref.make<ReadonlyArray<string>>([]);
    const layer = dependencies({
      storageGet: () =>
        Effect.fail(new FileStorage.StorageError({ operation: "get", cause: "provider details" })),
      markFailed: (_, failureCode) =>
        Ref.update(failures, (values) => [...values, failureCode]).pipe(
          Effect.as({ ...upload, status: "failed", failureCode }),
        ),
    });

    yield* Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 2 }).pipe(
      Effect.provide(layer),
      Effect.result,
    );
    expect(yield* Ref.get(failures)).toEqual([]);

    yield* Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 3 }).pipe(
      Effect.provide(layer),
      Effect.result,
    );
    expect(yield* Ref.get(failures)).toEqual(["storage_failed"]);
  }),
);

it.effect("retries the terminal status write before giving up", () =>
  Effect.gen(function* () {
    const attempts = yield* Ref.make(0);
    const layer = dependencies({
      storageGet: () =>
        Effect.fail(new FileStorage.StorageError({ operation: "get", cause: "provider details" })),
      markFailed: (_, failureCode) =>
        Ref.updateAndGet(attempts, (attempt) => attempt + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt < 3
              ? Effect.fail(
                  new ReceiptUploadRepository.PersistenceError({
                    operation: "markFailed",
                    cause: "database unavailable",
                  }),
                )
              : Effect.succeed({ ...upload, status: "failed", failureCode }),
          ),
        ),
    });

    const fiber = yield* Worker.process(
      { uploadId: upload.id },
      { id: upload.id, attempts: 3 },
    ).pipe(Effect.provide(layer), Effect.result, Effect.forkChild);
    yield* TestClock.adjust("2 seconds");
    yield* Fiber.join(fiber);

    expect(yield* Ref.get(attempts)).toBe(3);
  }),
);
