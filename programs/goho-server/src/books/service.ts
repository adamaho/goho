import {
  type Book,
  type BookConflict,
  type BookId,
  BookImageNotFound,
  BookNotFound,
  BooksUnavailable,
  type CreateBookRequest,
  type PatchBookRequest,
} from "@goho/goho-api/books";
import { Context, Effect, Layer, Option } from "effect";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";

import * as BookRepository from "./repository.ts";

// Persistence and storage details stay in the logs; callers see the domain error.
const unavailable = (message: string) => (error: unknown) =>
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
  /**
   * Deletes the book, its uploads and every stored scan of it. Files are removed
   * before the database commits, so a storage failure keeps the rows for a
   * retry, while files already removed stay removed.
   */
  readonly delete: (bookId: BookId) => Effect.Effect<void, BookNotFound | BooksUnavailable>;
  readonly getImage: (
    bookId: BookId,
  ) => Effect.Effect<
    { readonly bytes: Uint8Array; readonly contentType: string },
    BookImageNotFound | BooksUnavailable
  >;
}

/**
 * Creates, lists, retrieves, corrects, and deletes books, and serves their covers.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/goho-server/Books") {}

/**
 * Provides book operations over the book repository and file storage.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* BookRepository.Service;
    const storage = yield* FileStorage.Service;
    const transaction = yield* Transaction.Service;

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

    const deletionFailed = unavailable("Book deletion failed");

    const deleteBook = Effect.fn("@goho/BookService.deleteBook")(
      (bookId: BookId) =>
        transaction.run(
          Effect.gen(function* () {
            const deleted = yield* repository.delete(bookId);
            if (Option.isNone(deleted)) return yield* new BookNotFound();
            yield* Effect.forEach(deleted.value, (fileId) => storage.delete(fileId), {
              discard: true,
            });
          }),
        ),
      Effect.catchTags({
        "GohoServer.BookRepository.PersistenceError": deletionFailed,
        "GohoServer.FileStorage.StorageError": deletionFailed,
        "GohoServer.Database.TransactionError": deletionFailed,
      }),
    );

    const getImage = Effect.fn("@goho/BookService.getImage")(
      function* (bookId: BookId) {
        const cover = yield* repository.findCover(bookId);
        if (Option.isNone(cover)) return yield* new BookImageNotFound();
        const bytes = yield* storage.get(cover.value.fileId);
        return { bytes, contentType: cover.value.contentType };
      },
      Effect.catchTags({
        "GohoServer.BookRepository.PersistenceError": unavailable("Book cover lookup failed"),
        "GohoServer.FileStorage.StorageError": unavailable("Book cover retrieval failed"),
      }),
    );

    return Service.of({ create, delete: deleteBook, get, getImage, list, patch });
  }),
);
