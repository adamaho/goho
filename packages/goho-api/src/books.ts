import { Schema } from "effect";

import { Category, CategoryId } from "./categories.ts";
import { BigintId, maxId } from "./ids.ts";

const Text = Schema.Trim.check(Schema.isNonEmpty());

/**
 * Persisted book identity: canonical positive decimal text within PostgreSQL
 * `bigint` range, kept as a string so clients cannot round it.
 *
 * @category models
 * @since 0.1.0
 */
export const BookId = BigintId.annotate({
  identifier: "BookId",
  description: `The book's positive number on the roster, from 1 through ${maxId} without leading zeros, bud.`,
  examples: ["12"],
}).pipe(Schema.brand("BookId"));

/**
 * Decoded persisted book identity.
 *
 * @category models
 * @since 0.1.0
 */
export type BookId = typeof BookId.Type;

// Trim is a codec; OpenAPI needs field metadata on its encoded string side.
const BookFields = {
  title: Text.pipe(
    Schema.annotateEncoded({
      description:
        "Book title, shown as spelled. Case and extra spaces don't make it a different book.",
      examples: ["The Hobbit"],
    }),
  ),
  author: Text.pipe(
    Schema.annotateEncoded({
      description:
        "Author, shown as spelled. The same title by a different author is a different book.",
      examples: ["J. R. R. Tolkien"],
    }),
  ),
  category: Text.pipe(
    Schema.annotateEncoded({
      description:
        "Book category name. It is saved trimmed and lowercase; a name not on the roster yet joins it.",
      examples: ["Fiction"],
    }),
  ),
  readingLevel: Schema.NullOr(Text).pipe(
    Schema.annotateEncoded({
      description: "Reading level as you'd write it, or null when nobody has set one.",
      examples: ["Grade 4", null],
    }),
  ),
};

/**
 * Manually entered book. Creating a book whose title and author match a saved
 * one, ignoring case and extra whitespace, returns the saved book unchanged.
 *
 * @category models
 * @since 0.1.0
 */
export const CreateBookRequest = Schema.Struct({
  title: BookFields.title,
  author: BookFields.author,
  category: BookFields.category,
  readingLevel: Schema.optionalKey(BookFields.readingLevel),
}).annotate({
  identifier: "CreateBookRequest",
  description:
    "A book to put on the roster. Values are trimmed and stay nonempty; leave out the reading level or send null when it isn't known.",
  examples: [
    {
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: "Fiction",
      readingLevel: "Grade 4",
    },
  ],
});

/**
 * Decoded book creation input.
 *
 * @category models
 * @since 0.1.0
 */
export interface CreateBookRequest extends Schema.Schema.Type<typeof CreateBookRequest> {}

/**
 * Book corrections. Only supplied fields change, null clears the reading level,
 * and at least one field is required. The HTTP contract also rejects unsupported
 * properties.
 *
 * @category models
 * @since 0.1.0
 */
export const PatchBookRequest = Schema.Struct({
  title: Schema.optionalKey(BookFields.title),
  author: Schema.optionalKey(BookFields.author),
  category: Schema.optionalKey(BookFields.category),
  readingLevel: Schema.optionalKey(BookFields.readingLevel),
})
  .check(Schema.isMinProperties(1))
  .annotate({
    identifier: "PatchBookRequest",
    description:
      "Book details to correct, bud. Send at least one field; left-out fields stay put, and a null reading level clears it.",
    examples: [{ readingLevel: "Grade 5" }, { title: "The Hobbit", readingLevel: null }],
  });

/**
 * Decoded book corrections.
 *
 * @category models
 * @since 0.1.0
 */
export interface PatchBookRequest extends Schema.Schema.Type<typeof PatchBookRequest> {}

/**
 * Saved book, returned alike by creation, correction, retrieval, and listing.
 *
 * @category models
 * @since 0.1.0
 */
export const Book = Schema.Struct({
  id: BookId.annotateKey({ description: "The book's roster number; use it to target this book." }),
  title: BookFields.title,
  author: BookFields.author,
  category: Category.annotateKey({ description: "The book's category." }),
  readingLevel: BookFields.readingLevel,
  hasImage: Schema.Boolean.annotate({
    description: "Whether a cover image is on file; the first scan of a book without one adds it.",
  }),
}).annotate({
  identifier: "Book",
  description: "A saved book with its display spelling and category.",
  examples: [
    {
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
      readingLevel: "Grade 4",
      hasImage: false,
    },
  ],
});

/**
 * Complete persisted book.
 *
 * @category models
 * @since 0.1.0
 */
export interface Book extends Schema.Schema.Type<typeof Book> {}

// Errors name their wire schema; `Schema.TaggedError` cannot, so OpenAPI would
// call it `…Encoded`.

/**
 * No book has the requested ID.
 *
 * @category errors
 * @since 0.1.0
 */
export class BookNotFound extends Schema.Error<BookNotFound>("BookNotFound")(
  Schema.TaggedStruct("BookNotFound", {}).annotate({ identifier: "BookNotFound" }),
  { httpApiStatus: 404, description: "No book is wearing that number, bud." },
) {}

/**
 * The book does not exist or has no cover image on file.
 *
 * @category errors
 * @since 0.1.0
 */
export class BookImageNotFound extends Schema.Error<BookImageNotFound>("BookImageNotFound")(
  Schema.TaggedStruct("BookImageNotFound", {}).annotate({ identifier: "BookImageNotFound" }),
  { httpApiStatus: 404, description: "No cover is on file for that book number, bud." },
) {}

/**
 * A correction would give a book the title and author of another saved book.
 *
 * @category errors
 * @since 0.1.0
 */
export class BookConflict extends Schema.Error<BookConflict>("BookConflict")(
  Schema.TaggedStruct("BookConflict", {}).annotate({ identifier: "BookConflict" }),
  {
    httpApiStatus: 409,
    description:
      "Another book on the roster already has that title and author. Nothing changed and nothing merged.",
  },
) {}

/**
 * Books could not be read or saved; details stay in the server logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class BooksUnavailable extends Schema.Error<BooksUnavailable>("BooksUnavailable")(
  Schema.TaggedStruct("BooksUnavailable", {}).annotate({ identifier: "BooksUnavailable" }),
  {
    httpApiStatus: 500,
    description: "The server could not get to the book roster. Nothing changed; take another shot.",
  },
) {}
