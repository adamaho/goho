import { BookUploadContentType } from "@goho/goho-api/book-uploads";
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
import { FileId } from "#src/file-storage.ts";

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
  /** The stored file and MIME type of the book's cover; none without one or a book. */
  readonly findCover: (bookId: BookId) => Effect.Effect<Option.Option<Cover>, PersistenceError>;
  /**
   * Deletes the book with all its uploads and returns their file IDs for the
   * caller to remove before committing; none when the book does not exist. Its
   * category stays. The book is locked before its uploads are collected, so a
   * scan succeeding concurrently either finishes first and is collected or finds
   * the book gone.
   */
  readonly delete: (
    bookId: BookId,
  ) => Effect.Effect<Option.Option<ReadonlyArray<FileId>>, PersistenceError>;
}

/**
 * Stored cover image of a book.
 *
 * @category models
 * @since 0.1.0
 */
export interface Cover {
  readonly fileId: FileId;
  readonly contentType: BookUploadContentType;
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
    // in JSON. A book's cover is the one upload marked as it.
    const selectBooks = sql.literal(`
      SELECT b.id::text AS id, b.title, b.author,
        jsonb_build_object(
          'id', c.id::text, 'name', c.name, 'icon', c.icon, 'color', c.color,
          'kinds', to_jsonb(c.kinds)
        ) AS category,
        b.reading_level AS "readingLevel",
        EXISTS (
          SELECT 1 FROM book_uploads u WHERE u.book_id = b.id AND u.is_cover
        ) AS "hasImage"
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

    // Looking up first lets a duplicate return without touching the catalog. When a
    // concurrent save commits the same identity after that lookup, the insert does
    // nothing and a new statement sees the committed book.
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
            // Finding the book first keeps a missing one from leaving a new category behind.
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

    const selectCover = SqlSchema.findOneOption({
      Request: BookId,
      Result: Schema.Struct({ fileId: FileId, contentType: BookUploadContentType }),
      execute: (bookId) => sql`
        SELECT file_id AS "fileId", content_type AS "contentType"
        FROM book_uploads WHERE book_id = ${bookId} AND is_cover
      `,
    });

    const findCover = Effect.fn("@goho/BookRepository.findCover")(
      selectCover,
      Effect.mapError((cause) => new PersistenceError({ operation: "findCover", cause })),
    );

    const deleteUploads = SqlSchema.findAll({
      Request: BookId,
      Result: Schema.Struct({ file_id: FileId }),
      execute: (bookId) =>
        sql`DELETE FROM book_uploads WHERE book_id = ${bookId} RETURNING file_id`,
    });

    const deleteRow = SqlSchema.void({
      Request: BookId,
      execute: (bookId) => sql`DELETE FROM books WHERE id = ${bookId}`,
    });

    const deleteBook = Effect.fn("@goho/BookRepository.deleteBook")(
      (bookId: BookId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Serializes with scans choosing this book's cover, and keeps the file
            // IDs until the caller's transaction commits.
            if (Option.isNone(yield* lockBook(bookId))) return Option.none();
            const uploads = yield* deleteUploads(bookId);
            yield* deleteRow(bookId);
            return Option.some(uploads.map((upload) => upload.file_id));
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "delete", cause })),
    );

    return Service.of({ delete: deleteBook, findById, findCover, findOrCreate, list, update });
  }),
);
