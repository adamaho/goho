import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { Config, Context, Crypto, Effect, Layer, Redacted, Ref, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import { FileId } from "#src/file-storage.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as QueueConstants from "#src/queues/constants.ts";
import * as Processor from "#src/receipt-uploads/processor.ts";
import * as ReceiptUploadQueue from "#src/receipt-uploads/queue.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import { parsedReceipt } from "#test/receipts/fixtures.ts";

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
    const services = yield* Layer.build(Postgres.layer({ url: Redacted.make(testUrl.toString()) }));
    yield* Migrations.run().pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
).pipe(Layer.provide(NodeCrypto.layer));
const QueueLive = ReceiptUploadQueue.layer.pipe(Layer.provideMerge(DatabaseLive));
const RepositoryLive = ReceiptUploadRepository.layer.pipe(Layer.provide(DatabaseLive));
const StorageLive = Layer.succeed(FileStorage.Service, {
  put: () => Effect.succeed(FileId.make("drive-file")),
  get: () => Effect.succeed(new Uint8Array([1])),
  delete: () => Effect.void,
});
const ReceiptUploadsLive = ReceiptUploads.layer.pipe(
  Layer.provide([DatabaseLive, NodeCrypto.layer, QueueLive, RepositoryLive, StorageLive]),
);
const ProcessorLive = Layer.mergeAll(
  ReceiptUploadRepository.layer,
  ReceiptRepository.layer.pipe(Layer.provide(NodeCrypto.layer)),
  Transaction.layer,
  StorageLive,
  Layer.succeed(Ai.Service, {
    generateObject: ({ schema }) =>
      Schema.decodeUnknownEffect(schema)(parsedReceipt).pipe(Effect.orDie),
  }),
).pipe(Layer.provideMerge(DatabaseLive));

const makeJob = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return { uploadId: ReceiptUploadId.make(yield* crypto.randomUUIDv4) };
}).pipe(Effect.provide(NodeCrypto.layer));

class RetryableProcessingError extends Schema.TaggedError<RetryableProcessingError>()(
  "GohoServer.Test.RetryableProcessingError",
  {},
) {}

it.effect("offers and consumes a typed receipt upload job", () =>
  Effect.gen(function* () {
    const queue = yield* ReceiptUploadQueue.Service;
    const job = yield* makeJob;

    expect(yield* queue.offer(job)).toBe(job.uploadId);
    expect(yield* queue.take((taken, metadata) => Effect.succeed({ taken, metadata }))).toEqual({
      taken: job,
      metadata: { id: job.uploadId, attempts: 1 },
    });
  }).pipe(Effect.provide(QueueLive)),
);

it.effect("deduplicates jobs by upload ID", () =>
  Effect.gen(function* () {
    const queue = yield* ReceiptUploadQueue.Service;
    const sql = yield* SqlClient.SqlClient;
    const job = yield* makeJob;

    yield* queue.offer(job);
    yield* queue.offer(job);

    const rows = yield* sql`
      SELECT count(*)::int AS count
      FROM ${sql(QueueConstants.tableName)}
      WHERE queue_name = 'receipt-uploads' AND id = ${job.uploadId}
    `.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ count: Schema.Int }))),
      ),
    );
    expect(rows).toEqual([{ count: 1 }]);
  }).pipe(Effect.provide(QueueLive)),
);

it.effect("creates the upload row and queue job in one workflow", () =>
  Effect.gen(function* () {
    const uploads = yield* ReceiptUploads.Service;
    const sql = yield* SqlClient.SqlClient;
    const created = yield* uploads.create({
      name: "receipt.png",
      contentType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(created).toMatchObject({
      fileName: "receipt.png",
      contentType: "image/png",
      status: "queued",
    });
    const rows = yield* sql`
      SELECT state, id
      FROM ${sql(QueueConstants.tableName)}
      WHERE queue_name = 'receipt-uploads' AND id = ${created.id}
    `.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ state: Schema.String, id: Schema.String })),
        ),
      ),
    );
    expect(rows).toEqual([{ state: "pending", id: created.id }]);
  }).pipe(Effect.provide([ReceiptUploadsLive, DatabaseLive])),
);

it.effect("deletes the stored file when the database handoff fails", () =>
  Effect.gen(function* () {
    const deleted = yield* Ref.make<ReadonlyArray<FileStorage.FileId>>([]);
    const storage = Layer.succeed(FileStorage.Service, {
      put: () => Effect.succeed(FileStorage.FileId.make("orphaned-drive-file")),
      get: () => Effect.die("Unexpected storage.get call"),
      delete: (fileId) => Ref.update(deleted, (fileIds) => [...fileIds, fileId]),
    });
    const unavailableQueue = Layer.succeed(ReceiptUploadQueue.Service, {
      offer: () => Effect.die("queue unavailable"),
      take: () => Effect.die("Unexpected queue.take call"),
    });
    const uploads = yield* ReceiptUploads.Service.pipe(
      Effect.provide(
        ReceiptUploads.layer.pipe(
          Layer.provide([
            DatabaseLive,
            NodeCrypto.layer,
            RepositoryLive,
            storage,
            unavailableQueue,
          ]),
        ),
      ),
    );

    const result = yield* uploads
      .create({
        name: "receipt.png",
        contentType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      })
      .pipe(Effect.result);

    expect(result._tag).toBe("Failure");
    expect(yield* Ref.get(deleted)).toEqual(["orphaned-drive-file"]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("keeps pending work across queue layer restarts", () =>
  Effect.gen(function* () {
    const job = yield* makeJob;

    yield* Effect.gen(function* () {
      const queue = yield* ReceiptUploadQueue.Service;
      yield* queue.offer(job);
    }).pipe(Effect.provide(ReceiptUploadQueue.layer));

    const taken = yield* Effect.gen(function* () {
      const queue = yield* ReceiptUploadQueue.Service;
      return yield* queue.take(Effect.succeed);
    }).pipe(Effect.provide(ReceiptUploadQueue.layer));

    expect(taken).toEqual(job);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("saves the receipt and links its upload in one transaction", () =>
  Effect.gen(function* () {
    const uploads = yield* ReceiptUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const job = yield* makeJob;
    yield* uploads.createQueued({
      id: job.uploadId,
      fileId: FileId.make("processed-file"),
      fileName: "receipt.png",
      contentType: "image/png",
    });

    yield* Processor.process(job, { id: job.uploadId, attempts: 1 });

    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 1 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 3 }]);
    expect(
      yield* sql`
      SELECT status, receipt_id IS NOT NULL AS linked
      FROM receipt_uploads WHERE id = ${job.uploadId}
    `,
    ).toEqual([{ status: "succeeded", linked: true }]);
  }).pipe(Effect.provide(ProcessorLive)),
);

it.effect("rolls back the receipt and items when linking the upload fails", () =>
  Effect.gen(function* () {
    const uploads = yield* ReceiptUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const job = yield* makeJob;
    yield* uploads.createQueued({
      id: job.uploadId,
      fileId: FileId.make("processed-file"),
      fileName: "receipt.png",
      contentType: "image/png",
    });
    yield* sql`
      ALTER TABLE receipt_uploads ADD CONSTRAINT reject_success CHECK (status <> 'succeeded')
    `;

    const result = yield* Processor.process(job, { id: job.uploadId, attempts: 1 }).pipe(
      Effect.result,
    );

    expect(result._tag).toBe("Failure");
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
    expect(
      yield* sql`
      SELECT status, receipt_id IS NOT NULL AS linked
      FROM receipt_uploads WHERE id = ${job.uploadId}
    `,
    ).toEqual([{ status: "processing", linked: false }]);
  }).pipe(Effect.provide(ProcessorLive)),
);

it.live(
  "retries a failed handler up to the third attempt",
  () =>
    Effect.gen(function* () {
      const queue = yield* ReceiptUploadQueue.Service;
      const attempts = yield* Ref.make<ReadonlyArray<number>>([]);
      const job = yield* makeJob;
      yield* queue.offer(job);

      const process = queue.take((taken, metadata) =>
        Ref.update(attempts, (seen) => [...seen, metadata.attempts]).pipe(
          Effect.andThen(
            metadata.attempts < 3
              ? Effect.fail(new RetryableProcessingError())
              : Effect.succeed(taken),
          ),
        ),
      );

      yield* process.pipe(Effect.result);
      yield* process.pipe(Effect.result);
      expect(yield* process).toEqual(job);
      expect(yield* Ref.get(attempts)).toEqual([1, 2, 3]);
    }).pipe(Effect.provide(QueueLive)),
  15_000,
);
