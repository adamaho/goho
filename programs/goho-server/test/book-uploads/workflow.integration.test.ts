import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import {
  Config,
  Context,
  Crypto,
  Effect,
  FileSystem,
  Layer,
  Option,
  Redacted,
  Ref,
  Result,
} from "effect";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as BookUploadQueue from "#src/book-uploads/queue.ts";
import * as BookUploadRepository from "#src/book-uploads/repository.ts";
import * as BookUploads from "#src/book-uploads/service.ts";
import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";

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

// Real files in a directory removed with the test.
const StorageLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "goho-book-uploads-test-" });
    return FileStorage.layerFileSystem({ directory });
  }),
).pipe(Layer.provide(NodeServices.layer));

const InfrastructureLive = Layer.mergeAll(
  BookUploadRepository.layer,
  BookUploadQueue.layer,
  Transaction.layer,
  StorageLive,
  NodeCrypto.layer,
);

const TestLive = BookUploads.layer.pipe(
  Layer.provideMerge(InfrastructureLive),
  Layer.provideMerge(DatabaseLive),
);

const image = (byte: number) => new Uint8Array([byte, byte, byte]);

// The tag an effect fails with, or "succeeded".
const failureTag = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.result(effect).pipe(
    Effect.map((result) => (Result.isFailure(result) ? result.failure._tag : "succeeded")),
  );

const stored = (fileId: FileStorage.FileId) =>
  FileStorage.Service.use((storage) => storage.get(fileId)).pipe(
    Effect.map((bytes) => Option.some(new Uint8Array(bytes))),
    Effect.catchTag("GohoServer.FileStorage.StorageError", () => Effect.succeedNone),
  );

it.effect("enforces upload outcomes, one cover per book, and record timestamps", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO books (title, author, category_id)
      SELECT 'The Hobbit', 'J. R. R. Tolkien', id FROM categories WHERE name = 'fiction'
    `;
    const succeeded = (id: string, isCover: boolean) => sql`
      INSERT INTO book_uploads (
        id, file_id, file_name, content_type, status, book_id, is_cover,
        extraction_version, extracted_payload
      )
      SELECT ${id}, 'file', 'cover.png', 'image/png', 'succeeded', id, ${isCover}, 1, '{}'::jsonb
      FROM books
    `;
    const insert = (columns: string, values: string) =>
      sql`INSERT INTO book_uploads (id, file_id, file_name, content_type, ${sql.literal(columns)})
        VALUES ('00000000-0000-4000-8000-000000000009', 'file', 'cover.png', 'image/png', ${sql.literal(values)})`;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        // Several successful scans can belong to one book.
        yield* succeeded("00000000-0000-4000-8000-000000000001", true);
        yield* succeeded("00000000-0000-4000-8000-000000000002", false);
        expect(
          yield* sql`
            UPDATE book_uploads
            SET created_at = '2000-01-01T00:00:00Z', updated_at = '2000-01-01T00:00:00Z'
            WHERE id = '00000000-0000-4000-8000-000000000001'
            RETURNING created_at = now() AS creation_preserved,
              updated_at = statement_timestamp() AS update_recorded
          `,
        ).toEqual([{ creation_preserved: true, update_recorded: true }]);
      }),
    );
    for (const [reason, statement] of [
      ["a second cover", succeeded("00000000-0000-4000-8000-000000000003", true)],
      ["a cover still processing", insert("status, is_cover", "'processing', true")],
      [
        "a success without its book",
        insert("status, extraction_version, extracted_payload", "'succeeded', 1, '{}'"),
      ],
      ["a failure without its code", insert("status", "'failed'")],
      [
        "a receipt failure code",
        insert("status, failure_code", "'failed', 'receipt_creation_failed'"),
      ],
      // Book deletion removes uploads first, so files cannot become untracked.
      ["deleting a scanned book directly", sql`DELETE FROM books`],
    ] as const) {
      expect(Result.isFailure(yield* Effect.result(statement)), reason).toBe(true);
    }
    expect(yield* sql`SELECT count(*)::int AS count FROM book_uploads WHERE is_cover`).toEqual([
      { count: 1 },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("removes the stored scan when its upload cannot be queued", () =>
  Effect.gen(function* () {
    const storage = yield* FileStorage.Service;
    const repo = yield* BookUploadRepository.Service;
    const put = yield* Ref.make<ReadonlyArray<FileStorage.FileId>>([]);
    // Fresh, so this service uses the replacements instead of the memoized one from TestLive.
    const uploads = yield* BookUploads.Service.pipe(
      Effect.provide(
        Layer.fresh(BookUploads.layer).pipe(
          Layer.provide([
            Layer.succeed(FileStorage.Service, {
              ...storage,
              put: (file) =>
                storage
                  .put(file)
                  .pipe(Effect.tap((fileId) => Ref.update(put, (ids) => [...ids, fileId]))),
            }),
            Layer.succeed(BookUploadQueue.Service, {
              offer: () => Effect.die("queue unavailable"),
              take: () => Effect.die("Unexpected queue.take call"),
            }),
          ]),
        ),
      ),
    );

    const created = uploads.create({
      name: "cover.png",
      contentType: "image/png",
      bytes: image(1),
    });

    expect(yield* failureTag(created)).toBe("BookUploadsUnavailable");
    const fileIds = yield* Ref.get(put);
    expect(fileIds).toHaveLength(1);
    expect(yield* Effect.forEach(fileIds, stored)).toEqual([Option.none()]);
    expect(yield* repo.list).toEqual([]);
  }).pipe(Effect.provide(TestLive)),
);
