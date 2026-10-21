import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { BookId, type CreateBookRequest } from "@goho/goho-api/books";
import { CreateReceiptRequest } from "@goho/goho-api/receipts";
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Result } from "effect";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as BookRepository from "#src/books/repository.ts";
import * as CategoryRepository from "#src/categories/repository.ts";
import * as Migrations from "#src/database/migrations.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import { behindOpenTransaction } from "#test/helpers/locks.ts";

const hobbit: CreateBookRequest = {
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: "Fiction",
  readingLevel: "Grade 4",
};

const receiptWith = (category: string) =>
  CreateReceiptRequest.make({
    storeName: "Book Store",
    receiptDate: "2026-10-01",
    subtotal: "5",
    tax: "0",
    total: "5",
    currency: "CAD",
    items: [{ name: "Novel", amount: "5", category }],
  });

const RepositoriesLive = Layer.mergeAll(BookRepository.layer, ReceiptRepository.layer).pipe(
  Layer.provideMerge(CategoryRepository.layer),
);

// Each test owns a schema and pool, so concurrent saves use separate connections.
const DatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const crypto = yield* Crypto.Crypto;
    const schema = `test_${(yield* crypto.randomUUIDv4()).replaceAll("-", "")}`;
    yield* Effect.acquireRelease(admin`CREATE SCHEMA ${admin(schema)}`, () =>
      admin`DROP SCHEMA ${admin(schema)} CASCADE`.pipe(Effect.orDie),
    );
    const testUrl = new URL(Redacted.value(url));
    const options = testUrl.searchParams.get("options") ?? "";
    testUrl.searchParams.set("options", `${options} -c search_path=${schema}`.trim());
    const services = yield* Layer.build(
      RepositoriesLive.pipe(
        Layer.provideMerge(Postgres.layer({ url: Redacted.make(testUrl.toString()) })),
      ),
    );
    yield* Migrations.run().pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
).pipe(Layer.provide(NodeCrypto.layer));

const categoryNamed = (name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [category] = yield* sql`
      SELECT id::text, name, icon, color, to_jsonb(kinds) AS kinds FROM categories
      WHERE name = ${name}
    `;
    return category!;
  });

// Every category column. The driver has no binary codec for the enum array, so
// kinds come back as text.
const catalogRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`
    SELECT id, name, icon, color, kinds::text AS kinds, created_at, updated_at
    FROM categories ORDER BY id
  `;
});

const tables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* Effect.all([sql`SELECT * FROM books ORDER BY id`, catalogRows]);
});

it.effect("enforces category kinds and book identity in the database", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const categories = yield* CategoryRepository.Service;
    // Seeded receipt categories stay receipt-only; fiction and nonfiction are for books.
    expect(yield* categories.listNamesForCategory("book")).toEqual(["fiction", "nonfiction"]);
    expect(yield* categories.listNamesForCategory("receipt")).not.toContain("fiction");
    // Direct SQL inserts default to receipt categories.
    expect(
      yield* sql`INSERT INTO categories (name) VALUES ('snacks') RETURNING to_jsonb(kinds) AS kinds`,
    ).toEqual([{ kinds: ["receipt"] }]);
    // Kinds are a nonempty set, stored once each in enum order.
    for (const kinds of ["{}", "{receipt,receipt}", "{book,receipt}", "{receipt,NULL}", null]) {
      const insert = sql`INSERT INTO categories (name, kinds) VALUES ('candy', ${kinds}::category_kind[])`;
      expect(Result.isFailure(yield* Effect.result(insert)), String(kinds)).toBe(true);
    }
    expect(Result.isFailure(yield* Effect.result(sql`SELECT 'magazine'::category_kind`))).toBe(
      true,
    );

    const insertBook = (title: string, author: string, readingLevel: string | null = null) => sql`
      INSERT INTO books (title, author, category_id, reading_level)
      SELECT ${title}, ${author}, id, ${readingLevel} FROM categories WHERE name = 'fiction'
    `;
    yield* insertBook("The Hobbit", "J. R. R. Tolkien");
    // A different author is a different book.
    yield* insertBook("The Hobbit", "Someone Else");
    for (const attempt of [
      insertBook(" the  HOBBIT\t", "j. r. r.   tolkien "),
      insertBook(" ", "Author"),
      insertBook("Title", "\t"),
      insertBook("Title", "Author", "  "),
      sql`INSERT INTO books (title, author) VALUES ('Title', 'Author')`,
      sql`INSERT INTO books (title, author, category_id) VALUES ('Title', 'Author', 9999)`,
    ]) {
      expect(Result.isFailure(yield* Effect.result(attempt))).toBe(true);
    }
    expect(yield* sql`SELECT title, author FROM books ORDER BY id`).toEqual([
      { title: "The Hobbit", author: "J. R. R. Tolkien" },
      { title: "The Hobbit", author: "Someone Else" },
    ]);
    // A referenced category cannot be deleted.
    expect(
      Result.isFailure(yield* Effect.result(sql`DELETE FROM categories WHERE name = 'fiction'`)),
    ).toBe(true);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("saves one book per normalized identity and reuses it without changing anything", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const saved = yield* books.findOrCreate(hobbit);
    const fiction = yield* categoryNamed("fiction");
    expect(saved).toEqual({
      id: expect.any(String),
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: fiction,
      readingLevel: "Grade 4",
      hasImage: false,
    });
    expect(fiction).toMatchObject({ kinds: ["book"] });
    // Creation returns the same record find does.
    expect(yield* books.findById(saved.id)).toEqual(Option.some(saved));
    const before = yield* tables;

    // Case and whitespace variants return the saved book. Their category, even a new
    // name or a receipt-only one, and their reading level are ignored.
    for (const duplicate of [
      { title: " the   HOBBIT ", author: "j. r. r. tolkien", category: "Brand New Shelf" },
      { ...hobbit, category: "Groceries", readingLevel: "Grade 9" },
      { ...hobbit, readingLevel: null },
    ]) {
      expect(yield* books.findOrCreate(duplicate)).toEqual(saved);
    }
    expect(yield* tables).toEqual(before);

    // Another author is another book; an omitted reading level is null.
    const other = yield* books.findOrCreate({
      title: "The Hobbit",
      author: "Someone Else",
      category: "fiction",
    });
    expect(other.id).not.toBe(saved.id);
    expect(other.readingLevel).toBeNull();
    expect(yield* books.findById(BookId.make("9223372036854775807"))).toEqual(Option.none());
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("returns the committed book to a create that loses the race, without its category", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const categoriesBefore = yield* catalogRows;
    const [winner, loser] = yield* behindOpenTransaction(
      books.findOrCreate(hobbit),
      books.findOrCreate({
        title: "the hobbit",
        author: " J. R. R. TOLKIEN",
        category: "Brand New Shelf",
        readingLevel: "Grade 9",
      }),
      "INSERT INTO books",
    );
    expect(winner).toMatchObject({
      title: "The Hobbit",
      readingLevel: "Grade 4",
      category: { name: "fiction" },
    });
    expect(loser).toEqual(winner);
    expect(yield* sql`SELECT count(*)::int AS count FROM books`).toEqual([{ count: 1 }]);
    // The loser's new category rolled back with its insert.
    expect(yield* catalogRows).toEqual(categoriesBefore);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("shares categories across receipts and books, adding kinds and keeping IDs", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const receipts = yield* ReceiptRepository.Service;
    const categories = yield* CategoryRepository.Service;

    const receiptId = yield* receipts.insert(receiptWith("Comics"));
    const comics = yield* categoryNamed("comics");
    expect(comics).toMatchObject({ kinds: ["receipt"] });
    const book = yield* books.findOrCreate({ ...hobbit, category: " COMICS " });
    const shared = { ...comics, kinds: ["receipt", "book"] };
    expect(yield* categoryNamed("comics")).toEqual(shared);
    // Both domains return the same category shape.
    expect(book.category).toEqual(shared);
    expect(Option.getOrThrow(yield* receipts.findById(receiptId)).items[0].category).toEqual(
      shared,
    );

    // A book category used on a receipt also becomes a receipt category.
    const fiction = yield* categoryNamed("fiction");
    yield* receipts.insert(receiptWith("Fiction"));
    expect(yield* categoryNamed("fiction")).toEqual({ ...fiction, kinds: ["receipt", "book"] });
    expect(yield* categories.listNamesForCategory("book")).toEqual(["comics", "fiction", "nonfiction"]);
    expect(yield* categories.listNamesForCategory("receipt")).toContain("comics");
    expect(yield* categories.listNamesForCategory("receipt")).not.toContain("nonfiction");
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("keeps both kinds when receipt and book saves create one category concurrently", () =>
  Effect.gen(function* () {
    const categories = yield* CategoryRepository.Service;
    const [created, reused] = yield* behindOpenTransaction(
      categories.findOrCreate("Poetry", "receipt"),
      categories.findOrCreate(" poetry ", "book"),
      "INSERT INTO categories",
    );
    expect(reused).toEqual({ ...created, kinds: ["receipt", "book"] });
    expect(yield* categoryNamed("poetry")).toEqual(reused);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("finds title and author matches literally, newest first", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const save = (title: string, author: string) =>
      books
        .findOrCreate({ title, author, category: "Fiction" })
        .pipe(Effect.map((book) => book.id));
    const percent = yield* save("100% Cotton", "Ann Weaver");
    const underscore = yield* save("Cotton Fields", "A_B Writer");
    const question = yield* save("What? Where!", "Mary   Jones");
    const plain = yield* save("Plain Title", "Plain Author");
    // Creation time orders the list; ID breaks ties.
    yield* sql`ALTER TABLE books DISABLE TRIGGER maintain_record_timestamps`;
    yield* sql`
      UPDATE books SET created_at = CASE id
        WHEN ${percent} THEN '2026-10-03T00:00:00Z'::timestamptz
        ELSE '2026-10-01T00:00:00Z'::timestamptz
      END
    `;
    yield* sql`ALTER TABLE books ENABLE TRIGGER maintain_record_timestamps`;
    const search = (text: string) =>
      books.list(text).pipe(Effect.map((found) => found.map(({ id }) => id)));

    const everything = [percent, plain, question, underscore];
    expect(yield* search("")).toEqual(everything);
    expect(yield* search("   ")).toEqual(everything);
    expect(yield* search("%")).toEqual([percent]);
    expect(yield* search("_")).toEqual([underscore]);
    expect(yield* search("a_b")).toEqual([underscore]);
    expect(yield* search("?")).toEqual([question]);
    expect(yield* search("COTTON")).toEqual([percent, underscore]);
    expect(yield* search(" mary jones ")).toEqual([question]);
    expect(yield* search("Mary  Jones")).toEqual([question]);
    expect(yield* search("\\")).toEqual([]);
    expect(yield* search("zzz")).toEqual([]);
    // Listed books are the same records find returns.
    expect((yield* books.list("plain"))[0]).toEqual(
      Option.getOrThrow(yield* books.findById(plain)),
    );
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("corrects only supplied fields, clears the reading level, and allows case renames", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const original = yield* books.findOrCreate(hobbit);
    const bookId = original.id;
    const times = sql<{ created_at: string; updated_at: string }>`
      SELECT created_at::text, updated_at::text FROM books WHERE id = ${bookId}
    `;
    const [timesBefore] = yield* times;

    const renamed = Option.getOrThrow(yield* books.update(bookId, { title: "THE HOBBIT" }));
    expect(renamed).toEqual({ ...original, title: "THE HOBBIT" });
    const cleared = Option.getOrThrow(yield* books.update(bookId, { readingLevel: null }));
    expect(cleared).toEqual({ ...renamed, readingLevel: null });
    // Moving a book into a receipt category keeps the category's ID and adds the book kind.
    const groceries = yield* categoryNamed("groceries");
    const moved = Option.getOrThrow(
      yield* books.update(bookId, { category: "Groceries", readingLevel: "Grade 5" }),
    );
    expect(moved).toEqual({
      ...cleared,
      category: { ...groceries, kinds: ["receipt", "book"] },
      readingLevel: "Grade 5",
    });
    expect(yield* books.findById(bookId)).toEqual(Option.some(moved));
    const [timesAfter] = yield* times;
    expect(timesAfter!.created_at).toBe(timesBefore!.created_at);
    expect(timesAfter!.updated_at).not.toBe(timesBefore!.updated_at);

    // A missing book creates no category.
    const before = yield* tables;
    expect(
      yield* books.update(BookId.make("999"), { category: "Never Created", title: "Nope" }),
    ).toEqual(Option.none());
    expect(yield* tables).toEqual(before);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rejects a correction to another book's identity and leaves everything unchanged", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    yield* books.findOrCreate(hobbit);
    const other = yield* books.findOrCreate({ ...hobbit, title: "The Silmarillion" });
    const before = yield* tables;
    for (const changes of [
      { title: " the  hobbit " },
      { title: "The Hobbit", category: "Brand New Shelf", readingLevel: null },
    ]) {
      const result = yield* books.update(other.id, changes).pipe(Effect.result);
      expect(Result.isFailure(result) && result.failure._tag).toBe("BookConflict");
      expect(yield* tables).toEqual(before);
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("deletes a book and keeps its category", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const { id: bookId } = yield* books.findOrCreate({ ...hobbit, category: "Fantasy" });
    const { id: retained } = yield* books.findOrCreate({ ...hobbit, title: "The Silmarillion" });
    expect(yield* books.delete(bookId)).toBe(true);
    expect(yield* books.delete(bookId)).toBe(false);
    expect(yield* books.findById(bookId)).toEqual(Option.none());
    expect((yield* books.list("")).map(({ id }) => id)).toEqual([retained]);
    expect(yield* categoryNamed("fantasy")).toMatchObject({ kinds: ["book"] });
  }).pipe(Effect.provide(DatabaseLive)),
);
