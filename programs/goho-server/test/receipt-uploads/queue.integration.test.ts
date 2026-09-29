import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { Config, Context, Crypto, Effect, Layer, Redacted, Ref, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import { FileId } from "#src/file-storage.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as QueueConstants from "#src/queues/constants.ts";
import * as ReceiptUploadQueue from "#src/receipt-uploads/queue.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";

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
  Layer.provide([
    NodeCrypto.layer,
    QueueLive,
    RepositoryLive,
    StorageLive,
    Transaction.layer.pipe(Layer.provide(DatabaseLive)),
  ]),
);

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
            NodeCrypto.layer,
            RepositoryLive,
            storage,
            Transaction.layer.pipe(Layer.provide(DatabaseLive)),
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
