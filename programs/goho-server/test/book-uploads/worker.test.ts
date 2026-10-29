import { it } from "@effect/vitest";
import { Ai } from "@goho/core";
import { type BookUploadFailureCode, BookUploadId } from "@goho/goho-api/book-uploads";
import { Book, BookId, type CreateBookRequest } from "@goho/goho-api/books";
import { CategoryId } from "@goho/goho-api/categories";
import { Effect, Layer, Ref, Result } from "effect";
import { expect } from "vitest";

import type { BookExtraction, BookUpload } from "#src/book-uploads/model.ts";
import * as BookUploadRepository from "#src/book-uploads/repository.ts";
import * as Worker from "#src/book-uploads/worker.ts";
import * as BookRepository from "#src/books/repository.ts";
import * as CategoryRepository from "#src/categories/repository.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import { generateObject } from "#test/receipts/fixtures.ts";

const upload: BookUpload = {
  id: BookUploadId.make("3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b"),
  fileId: FileStorage.FileId.make("stored-cover"),
  fileName: "cover.jpg",
  contentType: "image/jpeg",
  status: "processing",
  bookId: null,
  failureCode: null,
  createdAt: "2026-10-20 14:00:00+00",
  updatedAt: "2026-10-20 14:00:00+00",
};

const parsed = { title: "The Hobbit", author: "J. R. R. Tolkien", category: "fiction" };

const book = Book.make({
  id: BookId.make("12"),
  title: parsed.title,
  author: parsed.author,
  category: {
    id: CategoryId.make("9"),
    name: "fiction",
    icon: "other",
    color: "grey",
    kinds: ["book"],
  },
  readingLevel: null,
  hasImage: true,
});

const dependencies = (options: {
  readonly categoryNames?: ReturnType<CategoryRepository.Interface["listNamesForCategory"]>;
  readonly transaction?: Transaction.Interface["run"];
  readonly generateObject?: Ai.Interface["generateObject"];
  readonly findOrCreate?: BookRepository.Interface["findOrCreate"];
  readonly storageGet?: FileStorage.Interface["get"];
  readonly markProcessing?: BookUploadRepository.Interface["markProcessing"];
  readonly markSucceeded?: BookUploadRepository.Interface["markSucceeded"];
  readonly markFailed?: BookUploadRepository.Interface["markFailed"];
}) =>
  Layer.mergeAll(
    options.transaction === undefined
      ? Transaction.layerTest
      : Layer.succeed(Transaction.Service, { run: options.transaction }),
    Layer.succeed(CategoryRepository.Service, {
      // Cover extraction is only offered book categories.
      listNamesForCategory: (kind) =>
        kind === "book"
          ? (options.categoryNames ?? Effect.succeed(["fiction", "nonfiction"]))
          : Effect.die(`Unexpected ${kind} category listing`),
      findOrCreate: () => Effect.die("Unexpected category creation"),
    }),
    Layer.succeed(FileStorage.Service, {
      put: () => Effect.die("Unexpected storage.put call"),
      get: options.storageGet ?? (() => Effect.succeed(new Uint8Array([1, 2, 3]))),
      delete: () => Effect.die("Unexpected storage.delete call"),
    }),
    Layer.succeed(Ai.Service, { generateObject: options.generateObject ?? generateObject(parsed) }),
    Layer.succeed(BookRepository.Service, {
      findOrCreate: options.findOrCreate ?? (() => Effect.succeed(book)),
      findById: () => Effect.die("Unexpected book lookup"),
      findCover: () => Effect.die("Unexpected cover lookup"),
      list: () => Effect.die("Unexpected book listing"),
      update: () => Effect.die("Unexpected book update"),
      delete: () => Effect.die("Unexpected book deletion"),
    }),
    Layer.succeed(BookUploadRepository.Service, {
      deleteFailed: () => Effect.die("Unexpected upload deletion"),
      list: Effect.die("Unexpected upload listing"),
      createQueued: () => Effect.die("Unexpected createQueued call"),
      hasIssuedId: () => Effect.die("Unexpected hasIssuedId call"),
      findById: () => Effect.die("Unexpected upload lookup"),
      markProcessing: options.markProcessing ?? (() => Effect.succeed(upload)),
      markSucceeded:
        options.markSucceeded ??
        ((_, bookId) => Effect.succeed({ ...upload, status: "succeeded", bookId })),
      markFailed:
        options.markFailed ??
        ((_, failureCode) => Effect.succeed({ ...upload, status: "failed", failureCode })),
      markAbandonedFailed: Effect.die("Unexpected recovery pass"),
    }),
  );

const job = { uploadId: upload.id };

it.effect("saves the scanned book without a reading level in the success transaction", () =>
  Effect.gen(function* () {
    const events = yield* Ref.make<ReadonlyArray<unknown>>([]);
    const record = (event: unknown) => Ref.update(events, (values) => [...values, event]);
    yield* Worker.process(job, { id: upload.id, attempts: 1 }).pipe(
      Effect.provide(
        dependencies({
          categoryNames: record("categories").pipe(Effect.as(["fiction", "nonfiction"])),
          generateObject: (options) =>
            record(JSON.stringify(options.prompt)).pipe(
              Effect.andThen(generateObject(parsed)(options)),
            ),
          transaction: (self) =>
            record("begin").pipe(
              Effect.andThen(self),
              Effect.tap(() => record("commit")),
            ),
          findOrCreate: (request: CreateBookRequest) =>
            record({ findOrCreate: request }).pipe(Effect.as(book)),
          markSucceeded: (uploadId, bookId, extraction: BookExtraction) =>
            record({ markSucceeded: [uploadId, bookId, extraction] }).pipe(
              Effect.as({ ...upload, status: "succeeded", bookId }),
            ),
        }),
      ),
    );
    const [categories, prompt, ...saved] = yield* Ref.get(events);
    expect(categories).toBe("categories");
    expect(prompt).toContain(
      JSON.stringify('Allowed book categories, as a JSON array: ["fiction","nonfiction"]'),
    );
    expect(prompt).not.toMatch(/reading/i);
    // Only title, author and category reach the book; reuse keeps a saved reading level.
    expect(saved).toEqual([
      "begin",
      { findOrCreate: parsed },
      { markSucceeded: [upload.id, book.id, { version: 1, payload: parsed }] },
      "commit",
    ]);
  }),
);

interface FailureCase {
  readonly name: string;
  readonly options: Parameters<typeof dependencies>[0];
  readonly failureCode: BookUploadFailureCode;
}

it.effect("records each step's failure code only after the final attempt", () =>
  Effect.gen(function* () {
    const cases: ReadonlyArray<FailureCase> = [
      {
        name: "storage",
        options: {
          storageGet: () =>
            Effect.fail(new FileStorage.StorageError({ operation: "get", cause: "" })),
        },
        failureCode: "storage_failed",
      },
      {
        name: "empty catalog",
        options: {
          categoryNames: Effect.succeed([]),
          generateObject: () => Effect.die("Unexpected AI request"),
        },
        failureCode: "internal_error",
      },
      {
        name: "book creation",
        options: {
          findOrCreate: () =>
            Effect.fail(
              new BookRepository.PersistenceError({ operation: "findOrCreate", cause: "" }),
            ),
        },
        failureCode: "book_creation_failed",
      },
    ];
    for (const { name, options, failureCode } of cases) {
      const failures = yield* Ref.make<ReadonlyArray<string>>([]);
      const layer = dependencies({
        ...options,
        markFailed: (_, code) =>
          Ref.update(failures, (values) => [...values, code]).pipe(
            Effect.as({ ...upload, status: "failed", failureCode: code }),
          ),
      });
      const early = yield* Worker.process(job, { id: upload.id, attempts: 2 }).pipe(
        Effect.provide(layer),
        Effect.result,
      );
      expect(Result.isFailure(early), name).toBe(true);
      expect(yield* Ref.get(failures), name).toEqual([]);
      const final = yield* Worker.process(job, { id: upload.id, attempts: 3 }).pipe(
        Effect.provide(layer),
        Effect.result,
      );
      expect(Result.isFailure(final) && final.failure.failureCode, name).toBe(failureCode);
      expect(yield* Ref.get(failures), name).toEqual([failureCode]);
    }
  }),
);

it.effect("discards redelivered jobs for finished or deleted uploads", () =>
  Effect.gen(function* () {
    for (const markProcessing of [
      () =>
        Effect.fail(
          new BookUploadRepository.InvalidTransition({
            uploadId: upload.id,
            currentStatus: "succeeded",
            requestedStatus: "processing",
          }),
        ),
      () => Effect.fail(new BookUploadRepository.UploadNotFound({ uploadId: upload.id })),
    ]) {
      yield* Worker.process(job, { id: upload.id, attempts: 3 }).pipe(
        Effect.provide(
          dependencies({
            markProcessing,
            storageGet: () => Effect.die("Finished upload must not read its scan"),
            findOrCreate: () => Effect.die("Finished upload must not save a book"),
            markFailed: () => Effect.die("Finished upload must not change"),
          }),
        ),
      );
    }
  }),
);
