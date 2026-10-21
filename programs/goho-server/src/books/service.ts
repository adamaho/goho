import {
  type Book,
  type BookConflict,
  type BookId,
  BookNotFound,
  BooksUnavailable,
  type CreateBookRequest,
  type PatchBookRequest,
} from "@goho/goho-api/books";
import { Context, Effect, Layer, Option } from "effect";

import * as BookRepository from "./repository.ts";

// Persistence details stay in the logs; callers see the domain error.
const unavailable = (message: string) => (error: BookRepository.PersistenceError) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new BooksUnavailable())));

const requireBook = <A>(saved: Option.Option<A>) =>
  Effect.fromOption(saved).pipe(Effect.mapError(() => new BookNotFound()));

/**
 * Book operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Saves a new book, or returns the saved book with the same identity unchanged.
   */
  readonly create: (book: CreateBookRequest) => Effect.Effect<Book, BooksUnavailable>;
  /** Books newest first, filtered by title or author when `search` is supplied. */
  readonly list: (
    search: string | undefined,
  ) => Effect.Effect<ReadonlyArray<Book>, BooksUnavailable>;
  readonly get: (bookId: BookId) => Effect.Effect<Book, BookNotFound | BooksUnavailable>;
  /** Saves the supplied fields; fails without changes for a missing book or a taken identity. */
  readonly patch: (
    bookId: BookId,
    changes: PatchBookRequest,
  ) => Effect.Effect<Book, BookNotFound | BookConflict | BooksUnavailable>;
  readonly delete: (bookId: BookId) => Effect.Effect<void, BookNotFound | BooksUnavailable>;
}

/**
 * Creates, lists, retrieves, corrects, and deletes books.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/goho-server/Books") {}

/**
 * Provides book operations over the book repository.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* BookRepository.Service;

    const create = Effect.fn("@goho/BookService.create")(
      (book: CreateBookRequest) => repository.findOrCreate(book),
      Effect.catchTag(
        "GohoServer.BookRepository.PersistenceError",
        unavailable("Book creation failed"),
      ),
    );

    const list = Effect.fn("@goho/BookService.list")(
      (search: string | undefined) => repository.list(search ?? ""),
      Effect.catchTag(
        "GohoServer.BookRepository.PersistenceError",
        unavailable("Book listing failed"),
      ),
    );

    const get = Effect.fn("@goho/BookService.get")(
      (bookId: BookId) => repository.findById(bookId).pipe(Effect.flatMap(requireBook)),
      Effect.catchTag(
        "GohoServer.BookRepository.PersistenceError",
        unavailable("Book retrieval failed"),
      ),
    );

    const patch = Effect.fn("@goho/BookService.patch")(
      (bookId: BookId, changes: PatchBookRequest) =>
        repository.update(bookId, changes).pipe(Effect.flatMap(requireBook)),
      Effect.catchTag(
        "GohoServer.BookRepository.PersistenceError",
        unavailable("Book correction failed"),
      ),
    );

    const deleteBook = Effect.fn("@goho/BookService.deleteBook")(
      function* (bookId: BookId) {
        if (!(yield* repository.delete(bookId))) return yield* new BookNotFound();
      },
      Effect.catchTag(
        "GohoServer.BookRepository.PersistenceError",
        unavailable("Book deletion failed"),
      ),
    );

    return Service.of({ create, delete: deleteBook, get, list, patch });
  }),
);
