import { type Book, BooksUnavailable, type CreateBookRequest } from "@goho/goho-api/books";
import { Context, Effect, Layer } from "effect";

import * as BookRepository from "./repository.ts";

// Persistence details stay in the logs; callers see the domain error.
const unavailable = (message: string) => (error: BookRepository.PersistenceError) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new BooksUnavailable())));

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
}

/**
 * Creates books.
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

    return Service.of({ create });
  }),
);
