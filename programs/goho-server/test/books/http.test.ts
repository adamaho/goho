import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Book, BookId, type CreateBookRequest, type PatchBookRequest } from "@goho/goho-api/books";
import { CategoryId } from "@goho/goho-api/categories";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer, Option } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { expect } from "vitest";

import * as BookRepository from "#src/books/repository.ts";
import * as Books from "#src/books/service.ts";
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

// Records what reaches the repository, so boundary rejections can prove nothing did.
const testLayer = (repository: Partial<BookRepository.Interface> = {}) => {
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
          Layer.provide(
            Layer.succeed(BookRepository.Service, {
              findOrCreate: record<[CreateBookRequest], Book>("findOrCreate", book),
              findById: record<[BookId], Option.Option<Book>>("findById", Option.some(book)),
              list: record<[string], ReadonlyArray<Book>>("list", [book]),
              update: record<[BookId, PatchBookRequest], Option.Option<Book>>(
                "update",
                Option.some(book),
              ),
              delete: record<[BookId], boolean>("delete", true),
              ...repository,
            }),
          ),
        ),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(ReceiptUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return { calls, layer };
};

it.effect("passes trimmed, validated books to the repository", () => {
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
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("rejects missing, blank, null, and unsupported book input", () => {
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
    expect(calls).toEqual([]);
  }).pipe(Effect.provide(layer));
});

it.effect("returns HTTP 500 without exposing book persistence details", () => {
  const { layer } = testLayer({
    findOrCreate: () => Effect.fail(persistenceError("findOrCreate")),
  });
  return Effect.gen(function* () {
    const body = yield* HttpBody.json({
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: "Fiction",
    });
    for (const request of [HttpClient.post("/books", { body })]) {
      const response = yield* request;
      expect(response.status).toBe(500);
      const text = yield* response.text;
      expect(text).not.toContain("private database details");
      expect(JSON.parse(text)).toEqual({ _tag: "BooksUnavailable" });
    }
  }).pipe(Effect.provide(layer));
});
