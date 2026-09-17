import { it } from "@effect/vitest";
import { Ai, GoogleDrive, GoogleSheets } from "@goho/core";
import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import type { ReceiptToSave } from "#src/receipts/model.ts";
import * as Workflow from "#src/receipts/process.ts";
import * as Repository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";

import { parsedReceipt, receipt } from "./fixtures.ts";

const savedId = ReceiptId.make("00000000-0000-4000-8000-000000000001");
const request = { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 1 };

const setup = (
  options: {
    readonly save?: Repository.Interface["save"];
    readonly existingInSheets?: boolean;
    readonly failAppend?: boolean;
    readonly mimeType?: string;
  } = {},
) =>
  Effect.gen(function* () {
    const events = yield* Ref.make<ReadonlyArray<string>>([]);
    const saves = yield* Ref.make<ReadonlyArray<ReceiptToSave>>([]);
    const appends = yield* Ref.make<ReadonlyArray<GoogleSheets.AppendRowsOptions>>([]);
    const file = {
      id: "receipt-1",
      name: "receipt.png",
      mimeType: options.mimeType ?? "image/png",
    };
    const record = (event: string) => Ref.update(events, (all) => [...all, event]);
    const layer = Layer.mergeAll(
      Layer.succeed(GoogleDrive.Service, {
        listFolders: () =>
          Effect.succeed(
            Workflow.requiredFolders.map((name) => ({
              id: name,
              name,
              mimeType: "application/vnd.google-apps.folder",
            })),
          ),
        listFiles: () => Effect.succeed([file]),
        downloadFile: () => Stream.make(new Uint8Array([1])),
        moveFile: (move) => record(`move:${move.destinationFolderId}`).pipe(Effect.as(file)),
      }),
      Layer.succeed(GoogleSheets.Service, {
        readRows: () =>
          Effect.succeed(
            options.existingInSheets ? [["source_file_id"], [file.id]] : [["source_file_id"]],
          ),
        appendRows: (append) =>
          Effect.gen(function* () {
            yield* record("append");
            if (options.failAppend)
              return yield* new GoogleSheets.SheetsError({
                operation: "appendRows",
                message: "Sheets unavailable",
              });
            yield* Ref.update(appends, (all) => [...all, append]);
            return {};
          }),
      }),
      Layer.succeed(Ai.Service, {
        generateObject: (generate) =>
          record("parse").pipe(
            Effect.andThen(
              Schema.decodeUnknownEffect(generate.schema)(parsedReceipt).pipe(Effect.orDie),
            ),
          ),
      }),
      Layer.succeed(Repository.Service, {
        create: () => Effect.die("unexpected create"),
        findById: () => Effect.die("unexpected findById"),
        list: () => Effect.die("unexpected list"),
        save: (input) =>
          record("save").pipe(
            Effect.andThen(Ref.update(saves, (all) => [...all, input])),
            Effect.andThen(
              options.save
                ? options.save(input)
                : Effect.succeed({
                    _tag: "Inserted",
                    receiptId: savedId,
                  } satisfies Repository.SaveResult),
            ),
          ),
      }),
    );
    const service = yield* Receipts.Service.pipe(
      Effect.provide(Receipts.layer.pipe(Layer.provide(layer))),
    );
    return { service, events, saves, appends };
  });

it.effect("saves the richer receipt before appending matching Sheets rows", () =>
  Effect.gen(function* () {
    const test = yield* setup();
    const results = yield* test.service.process(request);
    expect(results).toEqual([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]);
    expect(yield* Ref.get(test.saves)).toEqual([receipt]);
    expect(yield* Ref.get(test.appends)).toEqual([
      {
        spreadsheetId: "sheet",
        range: "RAW!A:F",
        valueInputOption: "USER_ENTERED",
        rows: [
          ["Example Store", "2026-09-01", "Groceries", "Apples", 0.3333333333333333, "receipt-1"],
          ["Example Store", "2026-09-01", "Groceries", "Apples", 0.3333333333333333, "receipt-1"],
          ["Example Store", "2026-09-01", "Groceries", "Adjustment", -1, "receipt-1"],
        ],
      },
    ]);
    expect(yield* Ref.get(test.events)).toEqual([
      "move:processing",
      "parse",
      "save",
      "append",
      "move:processed",
    ]);
  }),
);

it.effect("continues Sheets processing after an expected database write failure", () =>
  Effect.gen(function* () {
    const test = yield* setup({
      save: () =>
        Effect.fail(
          new Repository.PersistenceError({
            operation: "save",
            cause: "database unavailable",
          }),
        ),
    });
    const results = yield* test.service.process(request);
    expect(results[0]?._tag).toBe("Processed");
    expect(yield* Ref.get(test.appends)).toHaveLength(1);
    expect(yield* Ref.get(test.events)).toContain("move:processed");
  }),
);

it.effect("times out a stalled database save and finishes the accepted batch", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const cancelled = yield* Ref.make(false);
    const test = yield* setup({
      save: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Ref.set(cancelled, true)),
        ),
    });
    const fiber = yield* test.service.process(request).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    yield* TestClock.adjust("5 seconds");
    const results = yield* Fiber.join(fiber);
    expect(results[0]?._tag).toBe("Processed");
    expect(yield* Ref.get(cancelled)).toBe(true);
    expect(yield* Ref.get(test.appends)).toHaveLength(1);
  }),
);

it.effect("does not skip Sheets when the database already contains the receipt", () =>
  Effect.gen(function* () {
    const test = yield* setup({
      save: () => Effect.succeed({ _tag: "AlreadyExists", receiptId: savedId }),
    });
    yield* test.service.process(request);
    expect(yield* Ref.get(test.appends)).toHaveLength(1);
  }),
);

it.effect("keeps the existing Sheets skip behavior without backfilling the database", () =>
  Effect.gen(function* () {
    const test = yield* setup({ existingInSheets: true });
    const results = yield* test.service.process(request);
    expect(results[0]?._tag).toBe("AlreadyProcessed");
    expect(yield* Ref.get(test.saves)).toEqual([]);
    expect(yield* Ref.get(test.appends)).toEqual([]);
    expect(yield* Ref.get(test.events)).toEqual(["move:processing", "move:processed"]);
  }),
);

it.effect("preserves Sheets failure handling after a successful database save", () =>
  Effect.gen(function* () {
    const test = yield* setup({ failAppend: true });
    const results = yield* test.service.process(request);
    expect(results).toEqual([
      {
        _tag: "Failed",
        fileId: "receipt-1",
        fileName: "receipt.png",
        stage: "AppendRows",
        disposition: "MovedToFailed",
      },
    ]);
    expect(yield* Ref.get(test.saves)).toHaveLength(1);
    expect(yield* Ref.get(test.events)).toEqual([
      "move:processing",
      "parse",
      "save",
      "append",
      "move:failed",
    ]);
  }),
);

it.effect("does not persist or append unsupported receipt files", () =>
  Effect.gen(function* () {
    const test = yield* setup({ mimeType: "application/pdf" });
    const results = yield* test.service.process(request);
    expect(results).toEqual([
      {
        _tag: "Failed",
        fileId: "receipt-1",
        fileName: "receipt.png",
        stage: "ValidateFile",
        disposition: "MovedToFailed",
      },
    ]);
    expect(yield* Ref.get(test.saves)).toEqual([]);
    expect(yield* Ref.get(test.appends)).toEqual([]);
  }),
);

it.effect("finishes persistence and Sheets after the accepted client's interruption", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const test = yield* setup({
      save: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as({ _tag: "Inserted", receiptId: savedId }),
        ),
    });
    const first = yield* test.service.process(request).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    const interrupt = yield* Fiber.interrupt(first).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(interrupt);
    expect(yield* Ref.get(test.appends)).toHaveLength(1);
    expect(yield* Ref.get(test.events)).toContain("move:processed");
  }),
);
