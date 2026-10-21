import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import {
  Book,
  BookConflict,
  BookId,
  type CreateBookRequest,
  type PatchBookRequest,
} from "@goho/goho-api/books";
import { CategoryId } from "@goho/goho-api/categories";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer, Option } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as BookRepository from "#src/books/repository.ts";
import * as Books from "#src/books/service.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";

const book = Book.make({
  id: BookId.make("12"),
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: {
    id: CategoryId.make("9"),
    name: "fiction",
    icon: "other",
    color: "grey",
    kinds: ["book"],
  },
  readingLevel: null,
  hasImage: false,
});

const persistenceError = (operation: string) =>
  new BookRepository.PersistenceError({ operation, cause: "private database details" });

const cover: BookRepository.Cover = {
  fileId: FileStorage.FileId.make("stored-cover"),
  contentType: "image/webp",
};

// Records what reaches the repository and storage, so boundary rejections can prove nothing did.
const testLayer = (
  repository: Partial<BookRepository.Interface> = {},
  storage: Partial<FileStorage.Interface> = {},
) => {
  const calls: Array<unknown> = [];
  const record =
    <Args extends ReadonlyArray<unknown>, A>(name: string, result: A) =>
    (...args: Args) =>
      Effect.sync(() => {
        calls.push([name, ...args]);
        return result;
      });
  const layer = HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide([
        Books.layer.pipe(
          Layer.provide([
            Transaction.layerTest,
            Layer.succeed(FileStorage.Service, {
              put: () => Effect.die("Unexpected storage.put"),
              get: record<[FileStorage.FileId], Uint8Array>("get", new Uint8Array([4, 5, 6])),
              delete: record<[FileStorage.FileId], void>("deleteFile", undefined),
              ...storage,
            }),
            Layer.succeed(BookRepository.Service, {
              findOrCreate: record<[CreateBookRequest], Book>("findOrCreate", book),
              findById: record<[BookId], Option.Option<Book>>("findById", Option.some(book)),
              findCover: record<[BookId], Option.Option<BookRepository.Cover>>(
                "findCover",
                Option.some(cover),
              ),
              list: record<[string], ReadonlyArray<Book>>("list", [book]),
              update: record<[BookId, PatchBookRequest], Option.Option<Book>>(
                "update",
                Option.some(book),
              ),
              delete: record<[BookId], Option.Option<ReadonlyArray<FileStorage.FileId>>>(
                "delete",
                Option.some([]),
              ),
              ...repository,
            }),
          ]),
        ),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(ReceiptUploads.Service, {}),
        Layer.mock(BookUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return { calls, layer };
};

it.effect("passes trimmed, validated books and searches to the repository", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    const created = yield* HttpClient.post("/books", {
      body: yield* HttpBody.json({
        title: " The Hobbit ",
        author: "J. R. R. Tolkien\t",
        category: " Fiction",
      }),
    });
    expect(created.status).toBe(200);
    expect(yield* created.json).toEqual({ data: book });
    yield* client.books.create({
      payload: {
        title: book.title,
        author: book.author,
        category: "Fiction",
        readingLevel: null,
      },
    });
    expect(yield* client.books.list({ query: {} })).toEqual({ data: [book] });
    yield* client.books.list({ query: { search: " 100%_cotton? " } });
    yield* client.books.patch({ params: { bookId: book.id }, payload: { readingLevel: null } });
    const patched = yield* HttpClient.patch("/books/9223372036854775807", {
      body: yield* HttpBody.json({ title: "  The Hobbit  ", category: " Fantasy " }),
    });
    expect(patched.status).toBe(200);
    expect(calls).toEqual([
      ["findOrCreate", { title: "The Hobbit", author: "J. R. R. Tolkien", category: "Fiction" }],
      [
        "findOrCreate",
        {
          title: "The Hobbit",
          author: "J. R. R. Tolkien",
          category: "Fiction",
          readingLevel: null,
        },
      ],
      // An omitted search lists everything; given text passes through untouched.
      ["list", ""],
      ["list", " 100%_cotton? "],
      ["update", book.id, { readingLevel: null }],
      ["update", "9223372036854775807", { title: "The Hobbit", category: "Fantasy" }],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("rejects missing, blank, null, unsupported, and malformed book input", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const valid = { title: "The Hobbit", author: "J. R. R. Tolkien", category: "Fiction" };
    for (const payload of [
      {},
      { author: valid.author, category: valid.category },
      { title: valid.title, category: valid.category },
      { title: valid.title, author: valid.author },
      { ...valid, title: " " },
      { ...valid, author: "" },
      { ...valid, category: "\t" },
      { ...valid, title: null },
      { ...valid, category: null },
      { ...valid, readingLevel: " " },
      { ...valid, readingLevel: 4 },
      { ...valid, hasImage: true },
      { ...valid, id: "12" },
      { ...valid, isbn: "9780547928227" },
      null,
      [],
    ]) {
      const response = yield* HttpClient.post("/books", { body: yield* HttpBody.json(payload) });
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(yield* response.text).toBe("");
    }
    for (const payload of [
      {},
      { title: null },
      { author: " " },
      { category: null },
      { readingLevel: "" },
      { title: "The Hobbit", hasImage: true },
      { readingLevel: null, id: "13" },
      null,
    ]) {
      const response = yield* HttpClient.patch(`/books/${book.id}`, {
        body: yield* HttpBody.json(payload),
      });
      expect(response.status, JSON.stringify(payload)).toBe(400);
    }
    const change = yield* HttpBody.json({ title: "The Hobbit" });
    for (const id of ["0", "-1", "01", "1.0", "abc", "9223372036854775808"]) {
      for (const [route, request] of [
        ["get", HttpClient.get(`/books/${id}`)],
        ["getImage", HttpClient.get(`/books/${id}/image`)],
        ["patch", HttpClient.patch(`/books/${id}`, { body: change })],
        ["delete", HttpClient.del(`/books/${id}`)],
      ] as const) {
        expect((yield* request).status, `${route} ${id}`).toBe(400);
      }
    }
    // A search sent twice decodes as a list, not text.
    const repeated = yield* HttpClient.get("/books?search=hobbit&search=tolkien");
    expect(repeated.status).toBe(400);
    expect(yield* repeated.text).toBe("");
    expect(calls).toEqual([]);
  }).pipe(Effect.provide(layer));
});

const getBook = HttpClient.get(`/books/${book.id}`);

const getImage = HttpClient.get(`/books/${book.id}/image`);

const deleteBook = HttpClient.del(`/books/${book.id}`);

const patchTitle = (title: string) =>
  HttpBody.json({ title }).pipe(
    Effect.flatMap((body) => HttpClient.patch(`/books/${book.id}`, { body })),
  );

interface ErrorCase {
  readonly repository: Partial<BookRepository.Interface>;
  readonly request: typeof getBook | ReturnType<typeof patchTitle>;
  readonly status: number;
  readonly tag: string;
}

it.effect("returns domain errors with their declared statuses", () =>
  Effect.gen(function* () {
    const notFound = { status: 404, tag: "BookNotFound" };
    const cases: ReadonlyArray<ErrorCase> = [
      { repository: { findById: () => Effect.succeedNone }, request: getBook, ...notFound },
      { repository: { delete: () => Effect.succeedNone }, request: deleteBook, ...notFound },
      {
        repository: { update: () => Effect.succeedNone },
        request: patchTitle("Gone"),
        ...notFound,
      },
      {
        repository: { findCover: () => Effect.succeedNone },
        request: getImage,
        status: 404,
        tag: "BookImageNotFound",
      },
      {
        repository: { update: () => Effect.fail(new BookConflict()) },
        request: patchTitle("Taken"),
        status: 409,
        tag: "BookConflict",
      },
    ];
    for (const { repository, request, status, tag } of cases) {
      yield* Effect.gen(function* () {
        const response = yield* request;
        expect(response.status).toBe(status);
        expect(yield* response.json).toEqual({ _tag: tag });
      }).pipe(Effect.provide(testLayer(repository).layer));
    }
  }),
);

it.effect("returns HTTP 500 without exposing book persistence details", () => {
  const { layer } = testLayer({
    findOrCreate: () => Effect.fail(persistenceError("findOrCreate")),
    findById: () => Effect.fail(persistenceError("findById")),
    findCover: () => Effect.fail(persistenceError("findCover")),
    list: () => Effect.fail(persistenceError("list")),
    update: () => Effect.fail(persistenceError("update")),
    delete: () => Effect.fail(persistenceError("delete")),
  });
  return Effect.gen(function* () {
    const body = yield* HttpBody.json({
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: "Fiction",
    });
    for (const request of [
      HttpClient.post("/books", { body }),
      HttpClient.get("/books"),
      HttpClient.get(`/books/${book.id}`),
      HttpClient.get(`/books/${book.id}/image`),
      HttpClient.patch(`/books/${book.id}`, { body }),
      HttpClient.del(`/books/${book.id}`),
    ]) {
      const response = yield* request;
      expect(response.status).toBe(500);
      const text = yield* response.text;
      expect(text).not.toContain("private database details");
      expect(JSON.parse(text)).toEqual({ _tag: "BooksUnavailable" });
    }
  }).pipe(Effect.provide(layer));
});

it.effect("serves the cover with its MIME type and private cache policy", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const response = yield* getImage;
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/webp");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(new Uint8Array(yield* response.arrayBuffer)).toEqual(new Uint8Array([4, 5, 6]));
    expect(calls).toEqual([
      ["findCover", book.id],
      ["get", cover.fileId],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("deletes every stored scan of a book, and hides storage failures", () =>
  Effect.gen(function* () {
    const fileIds = [FileStorage.FileId.make("cover"), FileStorage.FileId.make("duplicate")];
    const deleted = testLayer({ delete: () => Effect.succeedSome(fileIds) });
    yield* Effect.gen(function* () {
      expect((yield* deleteBook).status).toBe(204);
      expect(deleted.calls).toEqual(fileIds.map((fileId) => ["deleteFile", fileId]));
    }).pipe(Effect.provide(deleted.layer));

    const storageError = new FileStorage.StorageError({
      operation: "delete",
      cause: "private storage details",
    });
    const failing = testLayer(
      { delete: () => Effect.succeedSome(fileIds) },
      { get: () => Effect.fail(storageError), delete: () => Effect.fail(storageError) },
    );
    yield* Effect.gen(function* () {
      for (const request of [deleteBook, getImage]) {
        const response = yield* request;
        expect(response.status).toBe(500);
        const text = yield* response.text;
        expect(text).not.toContain("private storage details");
        expect(JSON.parse(text)).toEqual({ _tag: "BooksUnavailable" });
      }
    }).pipe(Effect.provide(failing.layer));
  }),
);
