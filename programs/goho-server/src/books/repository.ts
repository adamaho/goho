import {
  Book,
  BookConflict,
  BookId,
  type CreateBookRequest,
  type PatchBookRequest,
} from "@goho/goho-api/books";
import { CategoryId } from "@goho/goho-api/categories";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import * as CategoryRepository from "#src/categories/repository.ts";

/**
 * Expected failure while reading or saving books.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.BookRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

// Rolls back the savepoint of an insert that lost the identity race.
class DuplicateIdentity extends Schema.TaggedError<DuplicateIdentity>()(
  "GohoServer.BookRepository.DuplicateIdentity",
  {},
) {}

/**
 * Book persistence operations. Identity is the title and author compared in SQL
 * case-insensitively with whitespace trimmed and collapsed. Every operation that
 * returns a book returns the same record as `findById`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Returns the saved book with this identity, or saves the book with its category
   * resolved as a `book` category. Reuse changes nothing, including the catalog,
   * even when a concurrent save inserts the same identity first. Inside a caller's
   * transaction the insert joins it as a savepoint.
   */
  readonly findOrCreate: (book: CreateBookRequest) => Effect.Effect<Book, PersistenceError>;
  /** The saved book with this ID and its category; none when no book has it. */
  readonly findById: (bookId: BookId) => Effect.Effect<Option.Option<Book>, PersistenceError>;
  /**
   * Books newest first whose title or author contains `search` literally, ignoring
   * case and extra whitespace; every book for blank `search`.
   */
  readonly list: (search: string) => Effect.Effect<ReadonlyArray<Book>, PersistenceError>;
  /**
   * Saves only the supplied fields and returns the saved book; none, without
   * creating a category, for a missing book. Taking another book's identity fails
   * with `BookConflict` and changes nothing.
   */
  readonly update: (
    bookId: BookId,
    changes: PatchBookRequest,
  ) => Effect.Effect<Option.Option<Book>, BookConflict | PersistenceError>;
  /** Deletes the book; false when it does not exist. Its category stays. */
  readonly delete: (bookId: BookId) => Effect.Effect<boolean, PersistenceError>;
}

/**
 * Book persistence; callers decide how failures affect their workflow.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/BookRepository",
) {}

const identityConstraint = "books_identity_key";

const IdRow = Schema.Struct({ id: BookId });

const Identity = Schema.Struct({ title: Schema.String, author: Schema.String });

/**
 * Stores books on the shared SQL client.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const categories = yield* CategoryRepository.Service;

    // Each book with its category as the API object; text IDs keep their precision
    // in JSON. Covers arrive with book uploads; until then no book has one.
    const selectBooks = sql.literal(`
      SELECT b.id::text AS id, b.title, b.author,
        jsonb_build_object(
          'id', c.id::text, 'name', c.name, 'icon', c.icon, 'color', c.color,
          'kinds', to_jsonb(c.kinds)
        ) AS category,
        b.reading_level AS "readingLevel", false AS "hasImage"
      FROM books b JOIN categories c ON c.id = b.category_id
    `);

    const findByIdentity = SqlSchema.findOneOption({
      Request: Identity,
      Result: Book,
      execute: ({ title, author }) => sql`
        ${selectBooks}
        WHERE b.title_key = book_identity_text(${title})
          AND b.author_key = book_identity_text(${author})
      `,
    });

    const insertRow = SqlSchema.findOneOption({
      Request: Schema.Struct({
        ...Identity.fields,
        categoryId: CategoryId,
        readingLevel: Schema.NullOr(Schema.String),
      }),
      Result: IdRow,
      execute: (book) => sql`
        INSERT INTO books (title, author, category_id, reading_level)
        VALUES (${book.title}, ${book.author}, ${book.categoryId}, ${book.readingLevel})
        ON CONFLICT ON CONSTRAINT books_identity_key DO NOTHING
        RETURNING id::text AS id
      `,
    });

    const findBook = SqlSchema.findOneOption({
      Request: BookId,
      Result: Book,
      execute: (bookId) => sql`${selectBooks} WHERE b.id = ${bookId}`,
    });

    const selectList = SqlSchema.findAll({
      Request: Schema.String,
      Result: Book,
      // strpos matches literally, so punctuation and LIKE wildcards need no escaping.
      execute: (search) => sql`
        ${selectBooks}
        WHERE strpos(b.title_key, book_identity_text(${search})) > 0
          OR strpos(b.author_key, book_identity_text(${search})) > 0
        ORDER BY b.created_at DESC, b.id DESC
      `,
    });

    const lockBook = SqlSchema.findOneOption({
      Request: BookId,
      Result: IdRow,
      execute: (bookId) => sql`SELECT id::text AS id FROM books WHERE id = ${bookId} FOR UPDATE`,
    });

    const updateRow = SqlSchema.void({
      Request: Schema.Struct({
        bookId: BookId,
        // Encoding keeps only these editable columns, so no other field can reach the SET list.
        changes: Schema.Struct({
          title: Schema.optionalKey(Schema.String),
          author: Schema.optionalKey(Schema.String),
          categoryId: Schema.optionalKey(CategoryId),
          readingLevel: Schema.optionalKey(Schema.NullOr(Schema.String)),
        }).pipe(Schema.encodeKeys({ categoryId: "category_id", readingLevel: "reading_level" })),
      }),
      execute: ({ bookId, changes }) => sql`
        UPDATE books SET ${sql.update(changes)} WHERE id = ${bookId}
      `,
    });

    // A lost insert would leave a category it created or extended, so the category,
    // the insert and its read share a savepoint that a lost race rolls back.
    const insertNew = (book: CreateBookRequest) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const category = yield* categories.findOrCreate(book.category, "book");
          const inserted = yield* insertRow({
            title: book.title,
            author: book.author,
            categoryId: category.id,
            readingLevel: book.readingLevel ?? null,
          });
          if (Option.isNone(inserted)) return yield* new DuplicateIdentity();
          return yield* findBook(inserted.value.id).pipe(Effect.flatMap(Effect.fromOption));
        }),
      );

    const findOrCreate = Effect.fn("@goho/BookRepository.findOrCreate")(
      function* (book: CreateBookRequest) {
        const identity = { title: book.title, author: book.author };
        const existing = yield* findByIdentity(identity);
        if (Option.isSome(existing)) return existing.value;
        const inserted = yield* insertNew(book).pipe(
          Effect.asSome,
          Effect.catchTag("GohoServer.BookRepository.DuplicateIdentity", () => Effect.succeedNone),
        );
        if (Option.isSome(inserted)) return inserted.value;
        return yield* findByIdentity(identity).pipe(Effect.flatMap(Effect.fromOption));
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findOrCreate", cause })),
    );

    const findById = Effect.fn("@goho/BookRepository.findById")(
      findBook,
      Effect.mapError((cause) => new PersistenceError({ operation: "findById", cause })),
    );

    const list = Effect.fn("@goho/BookRepository.list")(
      selectList,
      Effect.mapError((cause) => new PersistenceError({ operation: "list", cause })),
    );

    const update = Effect.fn("@goho/BookRepository.update")(
      (bookId: BookId, changes: PatchBookRequest) =>
        sql.withTransaction(
          Effect.gen(function* () {
            if (Option.isNone(yield* lockBook(bookId))) return Option.none();
            const { category, ...fields } = changes;
            const categoryChange =
              category === undefined
                ? {}
                : { categoryId: (yield* categories.findOrCreate(category, "book")).id };
            yield* updateRow({ bookId, changes: { ...fields, ...categoryChange } }).pipe(
              Effect.mapError((error) =>
                error._tag === "SqlError" &&
                error.reason._tag === "UniqueViolation" &&
                error.reason.constraint === identityConstraint
                  ? new BookConflict()
                  : error,
              ),
            );
            return yield* findBook(bookId);
          }),
        ),
      Effect.mapError((cause) =>
        cause instanceof BookConflict
          ? cause
          : new PersistenceError({ operation: "update", cause }),
      ),
    );

    const deleteRow = SqlSchema.findOneOption({
      Request: BookId,
      Result: IdRow,
      execute: (bookId) => sql`DELETE FROM books WHERE id = ${bookId} RETURNING id::text AS id`,
    });

    const deleteBook = Effect.fn("@goho/BookRepository.deleteBook")(
      (bookId: BookId) => deleteRow(bookId).pipe(Effect.map(Option.isSome)),
      Effect.mapError((cause) => new PersistenceError({ operation: "delete", cause })),
    );

    return Service.of({ delete: deleteBook, findById, findOrCreate, list, update });
  }),
);
