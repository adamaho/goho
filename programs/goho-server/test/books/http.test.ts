import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { api } from "@goho/goho-api/api";
import {
  Book,
  BookConflict,
  BookId,
  BookImageNotFound,
  BookNotFound,
  BooksUnavailable,
  type CreateBookRequest,
  type PatchBookRequest,
} from "@goho/goho-api/books";
import { CategoryId } from "@goho/goho-api/categories";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer, Option } from "effect";
import { HttpBody, HttpClient, type HttpClientResponse, HttpRouter } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as BookRepository from "#src/books/repository.ts";
import * as Books from "#src/books/service.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as Http from "#src/http/routes.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";
import * as FileStorage from "#src/services/file-storage.ts";

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

const cover: BookRepository.Cover = {
  fileId: FileStorage.FileId.make("stored-cover"),
  contentType: "image/webp",
};

// Records what reaches the repository and storage, so boundary rejections can prove nothing did.
const testLayer = (
  repository: Partial<BookRepository.Interface> = {},
  storage: Partial<FileStorage.Interface> = {},
  transaction = Transaction.layerTest,
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
            transaction,
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
    // An omitted or null author is unknown.
    for (const author of [undefined, null]) {
      const unknown = yield* HttpClient.post("/books", {
        body: yield* HttpBody.json({ title: "Beowulf", category: "Poetry", author }),
      });
      expect(unknown.status).toBe(200);
    }
    expect(yield* client.books.list({ query: {} })).toEqual({ data: [book] });
    yield* client.books.list({ query: { search: " 100%_cotton? " } });
    yield* client.books.patch({
      params: { bookId: book.id },
      payload: { readingLevel: "Grade 5" },
    });
    yield* client.books.patch({ params: { bookId: book.id }, payload: { author: "Tolkien" } });
    const trimmed = yield* HttpClient.patch(`/books/${book.id}`, {
      body: yield* HttpBody.json({ author: " Tolkien ", readingLevel: " Grade 4 " }),
    });
    expect(trimmed.status).toBe(200);
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
      ["findOrCreate", { title: "Beowulf", category: "Poetry" }],
      ["findOrCreate", { title: "Beowulf", category: "Poetry", author: null }],
      // An omitted search lists everything; given text passes through untouched.
      ["list", ""],
      ["list", " 100%_cotton? "],
      ["update", book.id, { readingLevel: "Grade 5" }],
      ["update", book.id, { author: "Tolkien" }],
      ["update", book.id, { author: "Tolkien", readingLevel: "Grade 4" }],
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
      { title: valid.title, author: valid.author },
      { ...valid, title: " " },
      { ...valid, author: "" },
      { ...valid, author: " \t" },
      { ...valid, author: 7 },
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
      expect(yield* response.json).toEqual({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
      });
    }
    for (const payload of [
      {},
      { title: null },
      { author: null },
      { author: " " },
      { category: null },
      { readingLevel: null },
      { readingLevel: "" },
      { readingLevel: " \t" },
      { title: "Changed", author: null },
      { category: "New Shelf", readingLevel: null },
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
    expect(yield* repeated.json).toEqual({
      type: "about:blank",
      status: 400,
      title: "Bad Request",
      detail: "Request validation failed",
    });
    expect(calls).toEqual([]);
  }).pipe(Effect.provide(layer));
});

const getImage = HttpClient.get(`/books/${book.id}/image`);

const deleteBook = HttpClient.del(`/books/${book.id}`);

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

it.effect("deletes every stored scan of a book", () => {
  const fileIds = [FileStorage.FileId.make("cover"), FileStorage.FileId.make("duplicate")];
  const { calls, layer } = testLayer({ delete: () => Effect.succeedSome(fileIds) });
  return Effect.gen(function* () {
    expect((yield* deleteBook).status).toBe(204);
    expect(calls).toEqual(fileIds.map((fileId) => ["deleteFile", fileId]));
  }).pipe(Effect.provide(layer));
});

const privateDetails = "private SQL and /private/path details";
const repositoryFailure = new BookRepository.PersistenceError({
  operation: "test",
  cause: privateDetails,
});
const storageFailure = (operation: "get" | "delete") =>
  new FileStorage.StorageError({ operation, cause: privateDetails });

const problem = (error: unknown, type: string, status: number, title: string) => ({
  error,
  status,
  body: { type: `goho:problem:${type}`, status, title },
});
const bookNotFound = problem(BookNotFound, "book-not-found", 404, "Book not found");
const imageNotFound = problem(
  BookImageNotFound,
  "book-image-not-found",
  404,
  "Book image not found",
);
const bookConflict = problem(BookConflict, "book-conflict", 409, "Book already exists");
const booksUnavailable = problem(BooksUnavailable, "books-unavailable", 500, "Books unavailable");

const bookParams = { params: { bookId: book.id } };
const correction = { ...bookParams, payload: { title: "The Hobbit" } };

type TestClient = Effect.Success<ReturnType<typeof Client.make>>;

// Each case runs the real service over a failing fake, then checks the wire and the typed client.
const bookProblemCases: ReadonlyArray<{
  readonly name: string;
  readonly fixture: ReturnType<typeof testLayer>;
  readonly expected: ReturnType<typeof problem>;
  readonly call: (client: TestClient) => Effect.Effect<unknown, unknown>;
}> = [
  {
    name: "list books: unavailable",
    fixture: testLayer({ list: () => Effect.fail(repositoryFailure) }),
    expected: booksUnavailable,
    call: (client) => client.books.list({ query: {} }),
  },
  {
    name: "get book: missing",
    fixture: testLayer({ findById: () => Effect.succeedNone }),
    expected: bookNotFound,
    call: (client) => client.books.get(bookParams),
  },
  {
    name: "get book: unavailable",
    fixture: testLayer({ findById: () => Effect.fail(repositoryFailure) }),
    expected: booksUnavailable,
    call: (client) => client.books.get(bookParams),
  },
  {
    name: "create book: unavailable",
    fixture: testLayer({ findOrCreate: () => Effect.fail(repositoryFailure) }),
    expected: booksUnavailable,
    call: (client) =>
      client.books.create({ payload: { title: "The Hobbit", category: "Fiction" } }),
  },
  {
    name: "patch book: missing",
    fixture: testLayer({ update: () => Effect.succeedNone }),
    expected: bookNotFound,
    call: (client) => client.books.patch(correction),
  },
  {
    name: "patch book: identity taken",
    fixture: testLayer({ update: () => Effect.fail(new BookConflict()) }),
    expected: bookConflict,
    call: (client) => client.books.patch(correction),
  },
  {
    name: "patch book: unavailable",
    fixture: testLayer({ update: () => Effect.fail(repositoryFailure) }),
    expected: booksUnavailable,
    call: (client) => client.books.patch(correction),
  },
  {
    name: "delete book: missing",
    fixture: testLayer({ delete: () => Effect.succeedNone }),
    expected: bookNotFound,
    call: (client) => client.books.delete(bookParams),
  },
  {
    name: "delete book: database unavailable",
    fixture: testLayer({ delete: () => Effect.fail(repositoryFailure) }),
    expected: booksUnavailable,
    call: (client) => client.books.delete(bookParams),
  },
  {
    name: "delete book: storage unavailable",
    fixture: testLayer(
      { delete: () => Effect.succeedSome([cover.fileId]) },
      { delete: () => Effect.fail(storageFailure("delete")) },
    ),
    expected: booksUnavailable,
    call: (client) => client.books.delete(bookParams),
  },
  {
    name: "delete book: transaction unavailable",
    fixture: testLayer(
      {},
      {},
      Layer.succeed(
        Transaction.Service,
        Transaction.Service.of({
          run: () => Effect.fail(new Transaction.TransactionError({ cause: privateDetails })),
        }),
      ),
    ),
    expected: booksUnavailable,
    call: (client) => client.books.delete(bookParams),
  },
  {
    name: "get cover: missing",
    fixture: testLayer({ findCover: () => Effect.succeedNone }),
    expected: imageNotFound,
    call: (client) => client.books.getImage(bookParams),
  },
  {
    name: "get cover: database unavailable",
    fixture: testLayer({ findCover: () => Effect.fail(repositoryFailure) }),
    expected: booksUnavailable,
    call: (client) => client.books.getImage(bookParams),
  },
  {
    name: "get cover: storage unavailable",
    fixture: testLayer(
      { findCover: () => Effect.succeedSome(cover) },
      { get: () => Effect.fail(storageFailure("get")) },
    ),
    expected: booksUnavailable,
    call: (client) => client.books.getImage(bookParams),
  },
];

it.effect.each(bookProblemCases)(
  "returns a private, client-decodable problem for $name",
  ({ call, expected, fixture }) =>
    Effect.gen(function* () {
      // Captures the raw response the typed client decodes.
      const responses: Array<HttpClientResponse.HttpClientResponse> = [];
      const client = yield* HttpApiClient.make(api, {
        baseUrl: "",
        transformClient: HttpClient.tap((response) =>
          Effect.sync(() => {
            responses.push(response);
          }),
        ),
      });
      const failure = yield* call(client).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(expected.error);
      const [response] = responses;
      expect(response?.status).toBe(expected.status);
      expect(response?.headers["content-type"]).toContain("application/problem+json");
      expect(
        yield* Effect.fromNullishOr(response).pipe(Effect.flatMap((raw) => raw.json)),
      ).toStrictEqual(expected.body);
      // Failing fakes record nothing, so any recorded call is a write past the failure.
      expect(fixture.calls).toEqual([]);
    }).pipe(Effect.provide(fixture.layer)),
);
