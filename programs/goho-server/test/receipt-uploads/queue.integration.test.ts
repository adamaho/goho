import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { ReceiptId } from "@goho/goho-api/receipts";
import {
  Config,
  Context,
  Crypto,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Ref,
  Result,
  Schema,
} from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import * as CategoryRepository from "#src/categories/repository.ts";
import * as Migrations from "#src/database/migrations.ts";
import issuedUploadIds from "#src/database/migrations/0017-issued-upload-ids.ts";
import * as Transaction from "#src/database/transaction.ts";
import { FileId } from "#src/file-storage.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as QueueConstants from "#src/queues/constants.ts";
import * as ReceiptUploadQueue from "#src/receipt-uploads/queue.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Worker from "#src/receipt-uploads/worker.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import { behindOpenTransaction } from "#test/helpers/locks.ts";
import { parsedReceipt } from "#test/receipts/fixtures.ts";

const DatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const crypto = yield* Crypto.Crypto;
    const schema = `test_${(yield* crypto.randomUUIDv4()).replaceAll("-", "")}`;
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
  return { uploadId: ReceiptUploadId.make(yield* crypto.randomUUIDv4()) };
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
    const repository = yield* ReceiptUploadRepository.Service;
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

    const { uploadId: key } = yield* makeJob;
    const result = yield* uploads
      .create(
        {
          name: "receipt.png",
          contentType: "image/png",
          bytes: new Uint8Array([1, 2, 3]),
        },
        key,
      )
      .pipe(Effect.result);

    expect(result._tag).toBe("Failure");
    expect(yield* Ref.get(deleted)).toEqual(["orphaned-drive-file"]);
    // The rolled-back key was never issued, so a retry can still use it.
    expect(yield* repository.hasIssuedId(key)).toBe(false);
  }).pipe(Effect.provide([RepositoryLive, DatabaseLive])),
);

// Distinct file IDs, with every stored and deleted ID recorded.
const RecordingUploads = Effect.gen(function* () {
  const put = yield* Ref.make<ReadonlyArray<FileId>>([]);
  const deleted = yield* Ref.make<ReadonlyArray<FileId>>([]);
  const uploads = yield* ReceiptUploads.Service.pipe(
    Effect.provide(
      ReceiptUploads.layer.pipe(
        Layer.provide([
          NodeCrypto.layer,
          QueueLive,
          RepositoryLive,
          Transaction.layer.pipe(Layer.provide(DatabaseLive)),
          Layer.succeed(FileStorage.Service, {
            put: () =>
              Ref.modify(put, (ids) => {
                const fileId = FileId.make(`drive-file-${ids.length + 1}`);
                return [fileId, [...ids, fileId]];
              }),
            get: () => Effect.die("Unexpected storage.get call"),
            delete: (fileId) => Ref.update(deleted, (ids) => [...ids, fileId]),
          }),
        ]),
      ),
    ),
  );
  return { uploads, put, deleted };
});

const receiptImage: ReceiptUploads.UploadInput = {
  name: "receipt.png",
  contentType: "image/png",
  bytes: new Uint8Array([1]),
};

const countRows = (table: "receipt_uploads" | typeof QueueConstants.tableName, id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows =
      yield* sql`SELECT count(*)::int AS count FROM ${sql(table)} WHERE id::text = ${id}`;
    const [row] = yield* Schema.decodeUnknownEffect(
      Schema.Array(Schema.Struct({ count: Schema.Int })),
    )(rows);
    return row?.count;
  });

// Processes an upload into a new receipt, as the worker would.
const succeed = (uploadId: ReceiptUploadId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const repo = yield* ReceiptUploadRepository.Service;
    yield* repo.markProcessing(uploadId);
    const [receipt] = yield* sql`
      INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total, currency)
      VALUES ('Example Store', '2026-09-20', 10, 1, 11, 'CAD')
      RETURNING id::text AS id
    `.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ id: ReceiptId })]))),
    );
    yield* repo.markSucceeded(uploadId, receipt.id, { version: 2, payload: parsedReceipt });
    return receipt.id;
  });

it.effect("returns the existing upload for a repeated key without storing or queueing again", () =>
  Effect.gen(function* () {
    const repo = yield* ReceiptUploadRepository.Service;
    const { uploads, put, deleted } = yield* RecordingUploads;
    const { uploadId: key } = yield* makeJob;

    const created = yield* uploads.create(receiptImage, key);
    expect(created).toMatchObject({ id: key, status: "queued", fileName: "receipt.png" });
    expect(yield* uploads.create({ ...receiptImage, name: "retry.png" }, key)).toEqual(created);

    // A retry after processing finished returns the outcome, success or failure.
    const receiptId = yield* succeed(key);
    expect(yield* uploads.create(receiptImage, key)).toMatchObject({
      id: key,
      status: "succeeded",
      receiptId,
    });
    const { uploadId: failedKey } = yield* makeJob;
    yield* uploads.create(receiptImage, failedKey);
    yield* repo.markFailed(failedKey, "processing_failed");
    expect(yield* uploads.create(receiptImage, failedKey)).toMatchObject({
      id: failedKey,
      status: "failed",
      failureCode: "processing_failed",
    });

    // Without a key, every request is a new upload, as before keys existed.
    const first = yield* uploads.create(receiptImage);
    const second = yield* uploads.create(receiptImage);
    expect(first.id).not.toBe(second.id);

    expect(yield* Ref.get(put)).toHaveLength(4);
    expect(yield* Ref.get(deleted)).toEqual([]);
    for (const id of [key, failedKey]) {
      expect(yield* countRows("receipt_uploads", id)).toBe(1);
      expect(yield* countRows(QueueConstants.tableName, id)).toBe(1);
    }
  }).pipe(Effect.provide([RepositoryLive, DatabaseLive])),
);

it.effect("keeps one upload, file and job when requests with one key overlap", () =>
  Effect.gen(function* () {
    const repo = yield* ReceiptUploadRepository.Service;
    const { uploads, put, deleted } = yield* RecordingUploads;
    const { uploadId: key } = yield* makeJob;

    // The second request stores its file, then waits on the first's uncommitted ID.
    const [first, second] = yield* behindOpenTransaction(
      uploads.create(receiptImage, key),
      uploads.create(receiptImage, key),
      "INSERT INTO issued_upload_ids",
    );

    expect(second).toEqual(first);
    const [kept, lost] = yield* Ref.get(put);
    expect(Option.map(yield* repo.findById(key), ({ fileId }) => fileId)).toEqual(
      Option.some(kept),
    );
    expect(yield* Ref.get(deleted)).toEqual([lost]);
    expect(yield* countRows("receipt_uploads", key)).toBe(1);
    expect(yield* countRows(QueueConstants.tableName, key)).toBe(1);
  }).pipe(Effect.provide([RepositoryLive, DatabaseLive])),
);

it.effect("refuses a deleted upload's key, even once its queue job is cleaned up", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const repo = yield* ReceiptUploadRepository.Service;
    const receipts = yield* ReceiptRepository.Service;
    const { uploads, put } = yield* RecordingUploads;
    const { uploadId: failedKey } = yield* makeJob;
    const { uploadId: savedKey } = yield* makeJob;

    yield* uploads.create(receiptImage, failedKey);
    yield* repo.markFailed(failedKey, "processing_failed");
    yield* uploads.delete(failedKey);
    yield* uploads.create(receiptImage, savedKey);
    yield* receipts.delete(yield* succeed(savedKey));
    // Queue cleanup drops finished jobs, so the job can't be what keeps a key spent.
    yield* sql`DELETE FROM ${sql(QueueConstants.tableName)} WHERE id = ${failedKey}`;

    for (const key of [failedKey, savedKey]) {
      expect((yield* Effect.flip(uploads.create(receiptImage, key)))._tag).toBe("Gone");
      expect(yield* countRows("receipt_uploads", key)).toBe(0);
    }
    expect(yield* Ref.get(put)).toHaveLength(2);
    expect(yield* countRows(QueueConstants.tableName, failedKey)).toBe(0);
    expect(yield* countRows(QueueConstants.tableName, savedKey)).toBe(1);
  }).pipe(
    Effect.provide([
      RepositoryLive,
      ReceiptRepository.layer.pipe(
        Layer.provide(CategoryRepository.layer),
        Layer.provide(DatabaseLive),
      ),
      DatabaseLive,
    ]),
  ),
);

it.effect("refuses a key whose upload an overlapping request created and deleted", () =>
  Effect.gen(function* () {
    const repo = yield* ReceiptUploadRepository.Service;
    const { uploads, put, deleted } = yield* RecordingUploads;
    const { uploadId: key } = yield* makeJob;

    // The second request stores its file, then waits on the first's uncommitted ID.
    const [, gone] = yield* behindOpenTransaction(
      uploads
        .create(receiptImage, key)
        .pipe(
          Effect.andThen(repo.markFailed(key, "processing_failed")),
          Effect.andThen(uploads.delete(key)),
        ),
      Effect.flip(uploads.create(receiptImage, key)),
      "INSERT INTO issued_upload_ids",
    );

    expect(gone._tag).toBe("Gone");
    expect(yield* Ref.get(deleted)).toEqual(yield* Ref.get(put));
    expect(yield* Ref.get(put)).toHaveLength(2);
    expect(yield* countRows("receipt_uploads", key)).toBe(0);
    expect(yield* countRows(QueueConstants.tableName, key)).toBe(1);
  }).pipe(Effect.provide([RepositoryLive, DatabaseLive])),
);

it.effect("issues the IDs of existing uploads and of deleted uploads' jobs when migrating", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const uploads = yield* ReceiptUploads.Service;
    const repo = yield* ReceiptUploadRepository.Service;
    const live = yield* uploads.create(receiptImage);
    const deleted = yield* uploads.create(receiptImage);
    yield* repo.markFailed(deleted.id, "processing_failed");
    yield* uploads.delete(deleted.id);
    yield* sql`DROP TABLE issued_upload_ids`;

    yield* issuedUploadIds;

    expect(yield* repo.hasIssuedId(live.id)).toBe(true);
    expect(yield* repo.hasIssuedId(deleted.id)).toBe(true);
    expect(yield* repo.hasIssuedId(yield* makeJob.pipe(Effect.map((job) => job.uploadId)))).toBe(
      false,
    );
  }).pipe(Effect.provide([ReceiptUploadsLive, RepositoryLive, DatabaseLive])),
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

it.effect(
  "deletes a failed upload and its photo, rolling back when cleanup fails and allowing retry",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "goho-upload-delete-test-" });
      const storage = yield* FileStorage.Service.pipe(
        Effect.provide(FileStorage.layerFileSystem({ directory })),
      );
      const repo = yield* ReceiptUploadRepository.Service;
      let failCleanup = true;
      const deleted: FileId[] = [];
      const uploads = yield* ReceiptUploads.Service.pipe(
        Effect.provide(
          ReceiptUploads.layer.pipe(
            Layer.provide([
              NodeCrypto.layer,
              QueueLive,
              RepositoryLive,
              Transaction.layer.pipe(Layer.provide(DatabaseLive)),
              Layer.succeed(FileStorage.Service, {
                ...storage,
                delete: (fileId) =>
                  Effect.suspend(() => {
                    deleted.push(fileId);
                    return failCleanup
                      ? Effect.fail(
                          new FileStorage.StorageError({
                            operation: "delete",
                            cause: "private storage details",
                          }),
                        )
                      : storage.delete(fileId);
                  }),
              }),
            ]),
          ),
        ),
      );
      const created = yield* uploads.create({
        name: "receipt.png",
        contentType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      });
      for (const status of ["queued", "processing"] as const) {
        if (status === "processing") yield* repo.markProcessing(created.id);
        const rejected = yield* uploads.delete(created.id).pipe(Effect.result);
        expect(Result.isFailure(rejected) && rejected.failure._tag).toBe("Conflict");
        expect(deleted).toEqual([]);
      }
      yield* repo.markFailed(created.id, "processing_failed");
      const failedUpload = Option.getOrThrow(yield* repo.findById(created.id));
      const filePath = path.join(directory, failedUpload.fileId);
      const failure = yield* uploads.delete(created.id).pipe(Effect.result);
      expect(Result.isFailure(failure) && failure.failure._tag).toBe("InternalServerError");
      expect(yield* repo.findById(created.id)).toEqual(Option.some(failedUpload));
      expect(yield* fs.exists(filePath)).toBe(true);
      failCleanup = false;
      yield* uploads.delete(created.id);
      expect(yield* fs.exists(filePath)).toBe(false);
      expect(yield* repo.findById(created.id)).toEqual(Option.none());
      expect(yield* uploads.list).toEqual([]);
      const repeated = yield* uploads.delete(created.id).pipe(Effect.result);
      expect(Result.isFailure(repeated) && repeated.failure._tag).toBe("NotFound");
      expect(deleted).toEqual([failedUpload.fileId, failedUpload.fileId]);
    }).pipe(Effect.provide([RepositoryLive, DatabaseLive, NodeServices.layer])),
);

const MissingPhotoLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "goho-upload-missing-test-" });
    const storage = FileStorage.layerFileSystem({ directory }).pipe(
      Layer.provide(NodeServices.layer),
    );
    return ReceiptUploads.layer.pipe(
      Layer.provideMerge([
        NodeCrypto.layer,
        QueueLive,
        RepositoryLive,
        storage,
        Transaction.layer.pipe(Layer.provide(DatabaseLive)),
      ]),
    );
  }),
).pipe(Layer.provide(NodeServices.layer));

it.effect("deletes a failed upload even when its photo is already missing", () =>
  Effect.gen(function* () {
    const uploads = yield* ReceiptUploads.Service;
    const repo = yield* ReceiptUploadRepository.Service;
    const created = yield* uploads.create({
      name: "receipt.png",
      contentType: "image/png",
      bytes: new Uint8Array([1]),
    });
    yield* repo.markFailed(created.id, "storage_failed");
    const upload = Option.getOrThrow(yield* repo.findById(created.id));
    const storage = yield* FileStorage.Service;
    yield* storage.delete(upload.fileId);
    yield* uploads.delete(created.id);
    expect(yield* repo.findById(created.id)).toEqual(Option.none());
  }).pipe(Effect.provide(MissingPhotoLive)),
);

it.effect("fails an upload whose worker crashed during the final attempt", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const uploads = yield* ReceiptUploads.Service;
    const repo = yield* ReceiptUploadRepository.Service;
    // A background consumer defect does not fail this test directly, so record
    // photo reads to detect any unexpected redelivery.
    const storageRead = yield* Ref.make(false);
    const created = yield* uploads.create({
      name: "receipt.png",
      contentType: "image/png",
      bytes: new Uint8Array([1]),
    });
    // Seeds the state a process killed during attempt 3 leaves behind, without
    // killing one: the upload is processing and the dead worker's lock expired.
    yield* repo.markProcessing(created.id);
    yield* sql`
      UPDATE ${sql(QueueConstants.tableName)}
      SET attempts = ${ReceiptUploadQueue.maxAttempts},
        acquired_by = '00000000-0000-4000-8000-000000000000',
        acquired_at = NOW() - INTERVAL '3 minutes'
      WHERE queue_name = ${ReceiptUploadQueue.name} AND id = ${created.id}
    `;

    yield* Layer.build(
      Worker.layer.pipe(
        Layer.provide([
          Layer.mock(Ai.Service, {}),
          Layer.mock(CategoryRepository.Service, {}),
          Layer.mock(FileStorage.Service, {
            get: () =>
              Ref.set(storageRead, true).pipe(Effect.andThen(Effect.die("Unexpected storage.get"))),
          }),
          Layer.mock(ReceiptRepository.Service, {}),
        ]),
      ),
    );
    // Each tick runs the queue sweep and recovery schedules; lock expiry is
    // measured by the database clock, so the seeded lock is already stale.
    // Recovery only matches failed jobs, so the upload settling proves the sweep ran.
    const upload = yield* TestClock.adjust("30 seconds").pipe(
      Effect.andThen(repo.findById(created.id)),
      Effect.repeat({
        until: (found) => Option.exists(found, (value) => value.status !== "processing"),
      }),
    );

    expect(yield* Ref.get(storageRead)).toBe(false);
    expect(Option.map(upload, ({ status, failureCode }) => ({ status, failureCode }))).toEqual(
      Option.some({ status: "failed", failureCode: "internal_error" }),
    );
    yield* uploads.delete(created.id);
    expect(yield* repo.findById(created.id)).toEqual(Option.none());
  }).pipe(
    Effect.provide([
      ReceiptUploadsLive,
      QueueLive,
      RepositoryLive,
      Transaction.layer.pipe(Layer.provide(DatabaseLive)),
    ]),
  ),
);

it.effect("fails only unfinished uploads whose receipt upload job failed", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const queue = yield* ReceiptUploadQueue.Service;
    const repo = yield* ReceiptUploadRepository.Service;
    const create = Effect.gen(function* () {
      const { uploadId } = yield* makeJob;
      yield* repo.createQueued({
        id: uploadId,
        fileId: FileId.make("drive-file"),
        fileName: "receipt.png",
        contentType: "image/png",
      });
      yield* queue.offer({ uploadId });
      return uploadId;
    });
    const queued = yield* create;
    const processing = yield* create;
    const active = yield* create;
    const succeeded = yield* create;
    const failed = yield* create;
    const otherQueue = yield* create;
    yield* repo.markProcessing(processing);
    yield* repo.markProcessing(active);
    yield* repo.markProcessing(succeeded);
    const [receipt] = yield* sql`
      INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total, currency)
      VALUES ('Example Store', '2026-09-20', 10, 1, 11, 'CAD')
      RETURNING id::text AS id
    `.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ id: ReceiptId })]))),
    );
    yield* repo.markSucceeded(succeeded, receipt.id, { version: 2, payload: parsedReceipt });
    yield* repo.markFailed(failed, "storage_failed");
    yield* sql`
      UPDATE ${sql(QueueConstants.tableName)} SET state = 'failed'
      WHERE queue_name = ${ReceiptUploadQueue.name}
      AND id IN ${sql.in([queued, processing, succeeded, failed])}
    `;
    yield* sql`
      INSERT INTO ${sql(QueueConstants.tableName)}
        (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
      VALUES (${otherQueue}, 'other-queue', '{}', 'failed', 3, NOW(), NOW(), NOW())
    `;
    const before = yield* repo.list;

    const recovered = yield* repo.markAbandonedFailed;

    const after = yield* repo.list;
    const isRecovered = ({ id }: { readonly id: ReceiptUploadId }) =>
      id === queued || id === processing;
    const byId = (a: { readonly id: string }, b: { readonly id: string }) =>
      a.id.localeCompare(b.id);
    expect([...recovered].sort(byId)).toEqual(after.filter(isRecovered).sort(byId));
    expect(
      Object.fromEntries(after.map(({ id, status, failureCode }) => [id, { status, failureCode }])),
    ).toEqual({
      [queued]: { status: "failed", failureCode: "internal_error" },
      [processing]: { status: "failed", failureCode: "internal_error" },
      [active]: { status: "processing", failureCode: null },
      [succeeded]: { status: "succeeded", failureCode: null },
      [failed]: { status: "failed", failureCode: "storage_failed" },
      [otherQueue]: { status: "queued", failureCode: null },
    });
    expect(after.filter((upload) => !isRecovered(upload))).toEqual(
      before.filter((upload) => !isRecovered(upload)),
    );
    expect(yield* repo.markAbandonedFailed).toEqual([]);
  }).pipe(Effect.provide([QueueLive, RepositoryLive])),
);
