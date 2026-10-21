import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { BookUploadId } from "@goho/goho-api/book-uploads";
import type { BookId } from "@goho/goho-api/books";
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
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import * as BookUploadQueue from "#src/book-uploads/queue.ts";
import * as BookUploadRepository from "#src/book-uploads/repository.ts";
import * as BookUploads from "#src/book-uploads/service.ts";
import * as Worker from "#src/book-uploads/worker.ts";
import * as BookRepository from "#src/books/repository.ts";
import * as Books from "#src/books/service.ts";
import * as CategoryRepository from "#src/categories/repository.ts";
import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as QueueConstants from "#src/queues/constants.ts";
import { behindOpenTransaction } from "#test/helpers/locks.ts";
import { generateObject } from "#test/receipts/fixtures.ts";

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

// Each model request runs the current answer, so a test can also act while a scan
// is in flight. The answer is validated against the requested schema like real output.
class CoverModel extends Context.Service<
  CoverModel,
  { readonly answer: Ref.Ref<Effect.Effect<unknown>> }
>()("@goho/goho-server/Test/CoverModel") {}

const hobbit = { title: "The Hobbit", author: "J. R. R. Tolkien", category: "fiction" };

const AiLive = Layer.effectContext(
  Effect.gen(function* () {
    const answer = yield* Ref.make<Effect.Effect<unknown>>(Effect.succeed(hobbit));
    return Context.empty().pipe(
      Context.add(
        Ai.Service,
        Ai.Service.of({
          generateObject: (options) =>
            Ref.get(answer).pipe(
              Effect.flatten,
              Effect.flatMap((output) => generateObject(output)(options)),
            ),
        }),
      ),
      Context.add(CoverModel, CoverModel.of({ answer })),
    );
  }),
);

const InfrastructureLive = Layer.mergeAll(
  BookRepository.layer.pipe(Layer.provideMerge(CategoryRepository.layer)),
  BookUploadRepository.layer,
  BookUploadQueue.layer,
  Transaction.layer,
  StorageLive,
  AiLive,
  NodeCrypto.layer,
);

const TestLive = Layer.mergeAll(BookUploads.layer, Books.layer).pipe(
  Layer.provideMerge(InfrastructureLive),
  Layer.provideMerge(DatabaseLive),
);

const answer = (output: unknown, during: Effect.Effect<void> = Effect.void) =>
  CoverModel.use((model) => Ref.set(model.answer, during.pipe(Effect.as(output))));

const image = (byte: number) => new Uint8Array([byte, byte, byte]);

const upload = (byte: number) =>
  BookUploads.Service.use((uploads) =>
    uploads.create({ name: `cover-${byte}.png`, contentType: "image/png", bytes: image(byte) }),
  );

const attempt = (uploadId: BookUploadId, attempts = 1) =>
  Worker.process({ uploadId }, { id: uploadId, attempts });

const bookOf = (scan: { readonly bookId: BookId | null }) =>
  scan.bookId === null ? Effect.die("The scan has no book") : Effect.succeed(scan.bookId);

const fileOf = (uploadId: BookUploadId) =>
  BookUploadRepository.Service.use((uploads) => uploads.findById(uploadId)).pipe(
    Effect.map((found) => Option.getOrThrow(found).fileId),
  );

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

// Every category column. The driver has no binary codec for the enum array, so
// kinds come back as text.
const catalogRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`
    SELECT id, name, icon, color, kinds::text AS kinds, created_at, updated_at
    FROM categories ORDER BY id
  `;
});

const bookRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`SELECT * FROM books ORDER BY id`;
});

const uploadRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`
    SELECT id::text, file_id, status, book_id::text, is_cover, failure_code,
      extraction_version, extracted_payload, created_at, updated_at
    FROM book_uploads ORDER BY created_at, id
  `;
});

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

it.effect("saves a queued scan as a new book with its cover and extraction", () =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const books = yield* Books.Service;
    const queue = yield* BookUploadQueue.Service;
    const sql = yield* SqlClient.SqlClient;
    const created = yield* upload(1);
    expect(created).toMatchObject({ status: "queued", bookId: null, failureCode: null });

    yield* queue.take(Worker.process);

    const done = yield* uploads.get(created.id);
    expect(done).toMatchObject({ id: created.id, status: "succeeded", failureCode: null });
    const bookId = yield* bookOf(done);
    expect(yield* books.get(bookId)).toEqual({
      id: bookId,
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: expect.objectContaining({ name: "fiction", kinds: ["book"] }),
      readingLevel: null,
      hasImage: true,
    });
    const cover = yield* books.getImage(bookId);
    expect([new Uint8Array(cover.bytes), cover.contentType]).toEqual([image(1), "image/png"]);
    expect(
      yield* sql`SELECT is_cover, extraction_version, extracted_payload FROM book_uploads`,
    ).toEqual([{ is_cover: true, extraction_version: 1, extracted_payload: hobbit }]);
    expect(
      yield* sql`
        SELECT state FROM ${sql(QueueConstants.tableName)}
        WHERE queue_name = ${BookUploadQueue.name} AND id = ${created.id}
      `,
    ).toEqual([{ state: "completed" }]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("offers the current book categories to every attempt and nothing else", () =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const books = yield* Books.Service;
    const catalog = yield* catalogRows;
    // Groceries is only a receipt category, so the first attempt cannot choose it.
    yield* answer({ ...hobbit, category: "groceries" });
    const created = yield* upload(1);
    const first = yield* attempt(created.id).pipe(Effect.result);
    expect(Result.isFailure(first) && first.failure.failureCode).toBe("processing_failed");
    expect(yield* uploads.get(created.id)).toMatchObject({ status: "processing", bookId: null });
    expect(yield* books.list("")).toEqual([]);
    expect(yield* catalogRows).toEqual(catalog);

    // Once a book uses it, the retry sees it.
    yield* books.create({ title: "Cookbook", author: "Chef", category: "Groceries" });
    yield* attempt(created.id, 2);
    const bookId = yield* bookOf(yield* uploads.get(created.id));
    expect((yield* books.get(bookId)).category).toMatchObject({
      name: "groceries",
      kinds: ["receipt", "book"],
    });

    // The model cannot add a category, and a final failure is visible.
    yield* answer({ title: "Leaves of Grass", author: "Walt Whitman", category: "poetry" });
    const other = yield* upload(2);
    yield* attempt(other.id, QueueConstants.maxAttempts).pipe(Effect.result);
    expect(yield* uploads.get(other.id)).toMatchObject({
      status: "failed",
      failureCode: "processing_failed",
      bookId: null,
    });
    expect(yield* books.list("grass")).toEqual([]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("reuses a saved book for duplicate scans and fills only a missing cover", () =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const books = yield* Books.Service;
    const manual = yield* books.create({
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: "Fiction",
      readingLevel: "Grade 4",
    });
    expect(manual.hasImage).toBe(false);
    const before = yield* Effect.all([bookRows, catalogRows]);

    // Case and spacing variants are the same book; the scanned category is ignored.
    yield* answer({ title: "the  HOBBIT", author: "j. r. r. tolkien ", category: "nonfiction" });
    const first = yield* upload(1);
    yield* attempt(first.id);
    const second = yield* upload(2);
    yield* attempt(second.id);

    expect(yield* books.get(manual.id)).toEqual({ ...manual, hasImage: true });
    expect(yield* Effect.all([bookRows, catalogRows])).toEqual(before);
    expect(new Uint8Array((yield* books.getImage(manual.id)).bytes)).toEqual(image(1));
    expect((yield* uploads.list).map(({ id, status, bookId }) => ({ id, status, bookId }))).toEqual(
      [
        { id: second.id, status: "succeeded", bookId: manual.id },
        { id: first.id, status: "succeeded", bookId: manual.id },
      ],
    );
    // Both originals stay on file for the book's deletion to remove.
    expect(yield* stored(yield* fileOf(second.id))).toEqual(Option.some(image(2)));
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rolls back a scan whose upload stopped processing, and ignores redelivery", () =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const repo = yield* BookUploadRepository.Service;
    const before = yield* Effect.all([bookRows, catalogRows]);
    const created = yield* upload(1);
    // Recovery fails the upload while the model reads it, so the new book must not commit.
    yield* answer(
      hobbit,
      repo.markFailed(created.id, "internal_error").pipe(Effect.orDie, Effect.asVoid),
    );
    const result = yield* attempt(created.id).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure.failureCode).toBe("internal_error");
    expect(yield* Effect.all([bookRows, catalogRows])).toEqual(before);
    expect(yield* uploads.get(created.id)).toMatchObject({
      status: "failed",
      failureCode: "internal_error",
      bookId: null,
    });

    // Late deliveries of failed and succeeded uploads change nothing.
    yield* answer(hobbit);
    const saved = yield* upload(2);
    yield* attempt(saved.id);
    const after = yield* Effect.all([bookRows, catalogRows, uploadRows]);
    yield* attempt(created.id, 2);
    yield* attempt(saved.id, 2);
    expect(yield* Effect.all([bookRows, catalogRows, uploadRows])).toEqual(after);
    expect((yield* bookRows).length).toBe(1);
  }).pipe(Effect.provide(TestLive)),
);

// Scans and deletion both take the book's row lock with this statement.
const lockStatement = "FROM books WHERE id = $1 FOR UPDATE";

it.effect("serializes cover choice and book deletion on the book lock", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const repo = yield* BookUploadRepository.Service;
    const crypto = yield* Crypto.Crypto;
    const book = yield* books.findOrCreate({ ...hobbit, category: "Fiction" });
    const processing = (fileId: string) =>
      Effect.gen(function* () {
        const id = BookUploadId.make(yield* crypto.randomUUIDv4());
        yield* repo.createQueued({
          id,
          fileId: FileStorage.FileId.make(fileId),
          fileName: "cover.png",
          contentType: "image/png",
        });
        yield* repo.markProcessing(id);
        return id;
      });
    const succeed = (uploadId: BookUploadId) =>
      repo.markSucceeded(uploadId, book.id, { version: 1, payload: hobbit });
    const earlier = yield* processing("earlier-file");
    const later = yield* processing("later-file");

    // The later scan commits first while the earlier one waits; it keeps the cover.
    yield* behindOpenTransaction(succeed(later), succeed(earlier), lockStatement);
    expect(yield* books.findCover(book.id)).toEqual(
      Option.some({ fileId: "later-file", contentType: "image/png" }),
    );

    // A scan that succeeds while deletion waits is deleted with the others.
    const last = yield* processing("last-file");
    const [, deleted] = yield* behindOpenTransaction(
      succeed(last),
      books.delete(book.id),
      lockStatement,
    );
    expect(Option.map(deleted, (fileIds) => [...fileIds].sort())).toEqual(
      Option.some(["earlier-file", "last-file", "later-file"]),
    );

    // A scan that finishes after deletion finds no book and changes nothing.
    const orphan = yield* processing("orphan-file");
    expect(yield* failureTag(succeed(orphan))).toBe(
      "GohoServer.BookUploadRepository.PersistenceError",
    );
    expect(Option.map(yield* repo.findById(orphan), ({ status }) => status)).toEqual(
      Option.some("processing"),
    );
  }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes a book with every scan of it and keeps other uploads", () =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const books = yield* Books.Service;
    const repo = yield* BookUploadRepository.Service;
    const cover = yield* upload(1);
    yield* attempt(cover.id);
    const duplicate = yield* upload(2);
    yield* attempt(duplicate.id);
    yield* answer({ ...hobbit, title: "The Silmarillion" });
    const other = yield* upload(3);
    yield* attempt(other.id);
    const failed = yield* upload(4);
    yield* repo.markFailed(failed.id, "processing_failed");
    const files = yield* Effect.forEach([cover, duplicate, other, failed], ({ id }) => fileOf(id));
    const bookId = yield* bookOf(yield* uploads.get(cover.id));
    const otherBookId = yield* bookOf(yield* uploads.get(other.id));

    yield* books.delete(bookId);

    expect(yield* failureTag(books.get(bookId))).toBe("BookNotFound");
    expect(yield* failureTag(books.getImage(bookId))).toBe("BookImageNotFound");
    expect(yield* failureTag(books.delete(bookId))).toBe("BookNotFound");
    expect(yield* Effect.forEach(files, stored)).toEqual([
      Option.none(),
      Option.none(),
      Option.some(image(3)),
      Option.some(image(4)),
    ]);
    expect((yield* uploads.list).map(({ id }) => id)).toEqual([failed.id, other.id]);
    expect((yield* books.get(otherBookId)).hasImage).toBe(true);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes only a failed scan and its file", () =>
  Effect.gen(function* () {
    const uploads = yield* BookUploads.Service;
    const repo = yield* BookUploadRepository.Service;
    const failed = yield* upload(1);
    const queued = yield* upload(2);
    yield* repo.markFailed(failed.id, "storage_failed");
    const files = yield* Effect.forEach([failed, queued], ({ id }) => fileOf(id));

    expect(yield* failureTag(uploads.delete(queued.id))).toBe("BookUploadConflict");
    yield* uploads.delete(failed.id);

    expect(yield* repo.findById(failed.id)).toEqual(Option.none());
    expect(yield* Effect.forEach(files, stored)).toEqual([Option.none(), Option.some(image(2))]);
    expect(yield* failureTag(uploads.delete(failed.id))).toBe("BookUploadNotFound");
  }).pipe(Effect.provide(TestLive)),
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

it.effect("fails book uploads their queue abandoned and leaves other queues' jobs alone", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const uploads = yield* BookUploads.Service;
    const repo = yield* BookUploadRepository.Service;
    const crypto = yield* Crypto.Crypto;
    // Seeds what a crash during the final attempt leaves: the job failed, the upload did not.
    const abandoned = yield* upload(1);
    yield* repo.markProcessing(abandoned.id);
    yield* sql`
      UPDATE ${sql(QueueConstants.tableName)} SET state = 'failed'
      WHERE queue_name = ${BookUploadQueue.name} AND id = ${abandoned.id}
    `;
    // Only a receipt job with this ID failed; the upload has no failed book job.
    const unrelated = yield* repo.createQueued({
      id: BookUploadId.make(yield* crypto.randomUUIDv4()),
      fileId: FileStorage.FileId.make("unrelated-file"),
      fileName: "cover.png",
      contentType: "image/png",
    });
    yield* sql`
      INSERT INTO ${sql(QueueConstants.tableName)}
        (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
      VALUES (${unrelated.id}, 'receipt-uploads', '{}', 'failed', 3, NOW(), NOW(), NOW())
    `;

    yield* Layer.build(Worker.layer);
    // Recovery runs at startup and then on its schedule, so the upload settles.
    const settled = yield* TestClock.adjust("30 seconds").pipe(
      Effect.andThen(repo.findById(abandoned.id)),
      Effect.repeat({
        until: (found) => Option.exists(found, ({ status }) => status !== "processing"),
        times: 10,
      }),
    );

    expect(Option.map(settled, ({ status, failureCode }) => ({ status, failureCode }))).toEqual(
      Option.some({ status: "failed", failureCode: "internal_error" }),
    );
    expect((yield* uploads.get(unrelated.id)).status).toBe("queued");
    yield* uploads.delete(abandoned.id);
    expect(yield* repo.findById(abandoned.id)).toEqual(Option.none());
  }).pipe(Effect.provide(TestLive)),
);
