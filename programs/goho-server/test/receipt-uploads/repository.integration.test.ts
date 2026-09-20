import { randomUUID } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { ReceiptId } from "@goho/goho-server-client/receipts";
import { Config, Context, Effect, Layer, Option, Redacted, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import { ReceiptUploadId } from "#src/receipt-uploads/model.ts";
import * as Repository from "#src/receipt-uploads/repository.ts";

const DatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    yield* Effect.acquireRelease(admin`CREATE SCHEMA ${admin(schema)}`, () =>
      admin`DROP SCHEMA ${admin(schema)} CASCADE`.pipe(Effect.orDie),
    );
    const testUrl = new URL(Redacted.value(url));
    const options = testUrl.searchParams.get("options") ?? "";
    testUrl.searchParams.set("options", `${options} -c search_path=${schema}`.trim());
    const services = yield* Layer.build(
      Repository.layer.pipe(
        Layer.provideMerge(Postgres.layer({ url: Redacted.make(testUrl.toString()) })),
      ),
    );
    yield* Migrations.run().pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
);

const makeUpload = () => ({
  id: ReceiptUploadId.make(randomUUID()),
  storageKey: "receipts/2026/example.png",
  fileName: "example.png",
  contentType: "image/png" as const,
});

const createReceipt = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total, currency)
    VALUES ('Example Store', '2026-09-20', 'Groceries', 10, 1, 11, 'CAD')
    RETURNING id::text AS id
  `;
  return ReceiptId.make(String(rows[0]!.id));
});

it.effect("creates a queued upload and finds it by ID", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const input = makeUpload();
    const created = yield* repo.createQueued(input);

    expect(created).toMatchObject({
      ...input,
      status: "queued",
      receiptId: null,
      failureCode: null,
    });
    expect(yield* repo.findById(input.id)).toEqual(Option.some(created));
    expect(yield* repo.findById(ReceiptUploadId.make(randomUUID()))).toEqual(Option.none());
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("moves a queued upload through processing to its receipt", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const input = makeUpload();
    yield* repo.createQueued(input);
    expect((yield* repo.markProcessing(input.id)).status).toBe("processing");
    expect((yield* repo.markProcessing(input.id)).status).toBe("processing");

    const receiptId = yield* createReceipt;
    expect(yield* repo.markSucceeded(input.id, receiptId)).toMatchObject({
      id: input.id,
      status: "succeeded",
      receiptId,
      failureCode: null,
    });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("records a safe failure from queued or processing", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const queued = makeUpload();
    const processing = makeUpload();
    yield* repo.createQueued(queued);
    yield* repo.createQueued(processing);
    yield* repo.markProcessing(processing.id);

    expect(yield* repo.markFailed(queued.id, "processing_failed")).toMatchObject({
      status: "failed",
      receiptId: null,
      failureCode: "processing_failed",
    });
    expect(yield* repo.markFailed(processing.id, "receipt_creation_failed")).toMatchObject({
      status: "failed",
      receiptId: null,
      failureCode: "receipt_creation_failed",
    });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rejects missing uploads and invalid terminal transitions", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const missingId = ReceiptUploadId.make(randomUUID());
    const missing = yield* repo.markProcessing(missingId).pipe(Effect.result);
    expect(Result.isFailure(missing) && missing.failure._tag).toBe(
      "GohoServer.ReceiptUploadRepository.UploadNotFound",
    );

    const input = makeUpload();
    yield* repo.createQueued(input);
    yield* repo.markFailed(input.id, "processing_failed");
    const invalid = yield* repo.markProcessing(input.id).pipe(Effect.result);
    expect(Result.isFailure(invalid) && invalid.failure).toMatchObject({
      _tag: "GohoServer.ReceiptUploadRepository.InvalidTransition",
      uploadId: input.id,
      currentStatus: "failed",
      requestedStatus: "processing",
    });
  }).pipe(Effect.provide(DatabaseLive)),
);
