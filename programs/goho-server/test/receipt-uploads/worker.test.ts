import { it } from "@effect/vitest";
import { Ai } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { type CreateReceiptRequest, ReceiptId } from "@goho/goho-api/receipts";
import { Effect, Fiber, Layer, Ref, Result, Schema } from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import * as CategoryRepository from "#src/categories/repository.ts";
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
  readonly categoryNames?: CategoryRepository.Interface["listNames"];
  readonly transaction?: Transaction.Interface["run"];
  readonly generateObject?: Ai.Interface["generateObject"];
  readonly insertReceipt?: ReceiptRepository.Interface["insert"];
  readonly storageGet?: FileStorage.Interface["get"];
  readonly markProcessing?: ReceiptUploadRepository.Interface["markProcessing"];
  readonly markSucceeded?: ReceiptUploadRepository.Interface["markSucceeded"];
  readonly markFailed?: ReceiptUploadRepository.Interface["markFailed"];
}) =>
  Layer.mergeAll(
    options.transaction === undefined
      ? Transaction.layerTest
      : Layer.succeed(Transaction.Service, { run: options.transaction }),
    Layer.succeed(CategoryRepository.Service, {
      listNames: options.categoryNames ?? Effect.succeed([]),
      findOrCreate: () => Effect.die("Unexpected category creation"),
    }),
    Layer.succeed(FileStorage.Service, {
      put: () => Effect.die("Unexpected storage.put call"),
      get: options.storageGet ?? (() => Effect.succeed(new Uint8Array([1, 2, 3]))),
      delete: () => Effect.die("Unexpected storage.delete call"),
    }),
    Layer.succeed(Ai.Service, {
      generateObject:
        options.generateObject ??
        (({ schema }) =>
          Schema.decodeUnknownEffect(schema)({
            ...parsedReceipt,
            transaction: { ...parsedReceipt.transaction, currency: options.currency ?? "CAD" },
          }).pipe(Effect.orDie)),
    }),
    Layer.succeed(ReceiptRepository.Service, {
      delete: () => Effect.die("Unexpected receipt deletion"),
      findById: () => Effect.succeedNone,
      insert: options.insertReceipt ?? (() => Effect.succeed(ReceiptId.make("42"))),
      list: Effect.succeed([]),
      update: () => Effect.die("Unexpected receipt update"),
      updateItem: () => Effect.die("Unexpected item update"),
    }),
    Layer.succeed(ReceiptUploadRepository.Service, {
      deleteFailed: () => Effect.die("Unexpected upload deletion"),
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
        version: 1,
        payload: {
          ...parsedReceipt,
          transaction: { ...parsedReceipt.transaction, currency: "USD" },
        },
      },
    ]);
  }),
);

it.effect("keeps the original upload date as extraction context when a job is retried later", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2030-01-01T00:00:00.000Z"));
    const prompts = yield* Ref.make<ReadonlyArray<string>>([]);
    const layer = dependencies({
      generateObject: ({ prompt, schema }) =>
        Ref.update(prompts, (values) => [...values, JSON.stringify(prompt)]).pipe(
          Effect.andThen(Schema.decodeUnknownEffect(schema)(parsedReceipt)),
          Effect.orDie,
        ),
    });
    yield* Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 2 }).pipe(
      Effect.provide(layer),
    );
    const observed = yield* Ref.get(prompts);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toContain(upload.createdAt);
    expect(observed[0]).not.toContain("2030-01-01");
  }),
);

it.effect("offers current category names to extraction before the save transaction", () =>
  Effect.gen(function* () {
    for (const [names, guidance] of [
      [
        ["groceries", "household"],
        'Existing categories, as a JSON array: ["groceries","household"]',
      ],
      [[], "There are no existing categories yet."],
    ] as const) {
      const events = yield* Ref.make<ReadonlyArray<string>>([]);
      const record = (event: string) => Ref.update(events, (values) => [...values, event]);
      yield* Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 1 }).pipe(
        Effect.provide(
          dependencies({
            categoryNames: record("categories").pipe(Effect.as(names)),
            generateObject: ({ prompt, schema }) =>
              record(JSON.stringify(prompt)).pipe(
                Effect.andThen(Schema.decodeUnknownEffect(schema)(parsedReceipt)),
                Effect.orDie,
              ),
            transaction: (self) => record("transaction").pipe(Effect.andThen(self)),
          }),
        ),
      );
      const [categories, prompt, transaction] = yield* Ref.get(events);
      expect([categories, transaction]).toEqual(["categories", "transaction"]);
      expect(prompt).toContain(JSON.stringify(guidance));
    }
  }),
);

it.effect("fails without calling AI when category names cannot be read", () =>
  Effect.gen(function* () {
    const failures = yield* Ref.make<ReadonlyArray<string>>([]);
    const result = yield* Worker.process(
      { uploadId: upload.id },
      { id: upload.id, attempts: 3 },
    ).pipe(
      Effect.provide(
        dependencies({
          categoryNames: Effect.fail(
            new CategoryRepository.PersistenceError({ operation: "listNames", cause: "down" }),
          ),
          generateObject: () => Effect.die("Unexpected AI request"),
          insertReceipt: () => Effect.die("Unexpected receipt creation"),
          markFailed: (_, failureCode) =>
            Ref.update(failures, (values) => [...values, failureCode]).pipe(
              Effect.as({ ...upload, status: "failed", failureCode }),
            ),
        }),
      ),
      Effect.result,
    );
    expect(Result.isFailure(result) && result.failure.failureCode).toBe("internal_error");
    expect(yield* Ref.get(failures)).toEqual(["internal_error"]);
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

it.effect("discards a redelivered job after its upload has been deleted", () =>
  Worker.process({ uploadId: upload.id }, { id: upload.id, attempts: 3 }).pipe(
    Effect.provide(
      dependencies({
        markProcessing: (uploadId) =>
          Effect.fail(new ReceiptUploadRepository.UploadNotFound({ uploadId })),
        storageGet: () => Effect.die("Deleted upload must not read a photo"),
        insertReceipt: () => Effect.die("Deleted upload must not create a receipt"),
        markFailed: () => Effect.die("Deleted upload must not be recreated"),
      }),
    ),
  ),
);
