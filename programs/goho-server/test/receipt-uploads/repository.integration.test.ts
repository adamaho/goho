import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { ReceiptId } from "@goho/goho-api/receipts";
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import { FileId } from "#src/file-storage.ts";
import * as Repository from "#src/receipt-uploads/repository.ts";

const DatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const crypto = yield* Crypto.Crypto;
    const schema = `test_${(yield* crypto.randomUUIDv4).replaceAll("-", "")}`;
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
).pipe(Layer.provide(NodeCrypto.layer));

const makeUpload = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return {
    id: ReceiptUploadId.make(yield* crypto.randomUUIDv4),
    fileId: FileId.make("drive-file-id"),
    fileName: "example.png",
    contentType: "image/png" as const,
  };
}).pipe(Effect.provide(NodeCrypto.layer));

const makeUploadId = Crypto.Crypto.use((crypto) => crypto.randomUUIDv4).pipe(
  Effect.map(ReceiptUploadId.make),
  Effect.provide(NodeCrypto.layer),
);

const createReceipt = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total, currency)
    VALUES ('Example Store', '2026-09-20', 'Groceries', 10, 1, 11, 'CAD')
    RETURNING id::text AS id
  `;
  return ReceiptId.make(String(rows[0]!.id));
});

it.effect("lists uploads newest first with their durable statuses", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const older = yield* makeUpload;
    const newer = yield* makeUpload;
    yield* repo.createQueued(older);
    yield* repo.createQueued(newer);
    yield* repo.markProcessing(newer.id);
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE receipt_uploads SET created_at = '2026-09-19' WHERE id = ${older.id}`;
    expect((yield* repo.list).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: newer.id, status: "processing" },
      { id: older.id, status: "queued" },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("creates a queued upload and finds it by ID", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const input = yield* makeUpload;
    const created = yield* repo.createQueued(input);

    expect(created).toMatchObject({
      ...input,
      status: "queued",
      receiptId: null,
      failureCode: null,
    });
    expect(yield* repo.findById(input.id)).toEqual(Option.some(created));
    expect(yield* repo.findById(yield* makeUploadId)).toEqual(Option.none());
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("moves a queued upload through processing to its receipt", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const input = yield* makeUpload;
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
    const queued = yield* makeUpload;
    const processing = yield* makeUpload;
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
    const missingId = yield* makeUploadId;
    const missing = yield* repo.markProcessing(missingId).pipe(Effect.result);
    expect(Result.isFailure(missing) && missing.failure._tag).toBe(
      "GohoServer.ReceiptUploadRepository.UploadNotFound",
    );

    const input = yield* makeUpload;
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
