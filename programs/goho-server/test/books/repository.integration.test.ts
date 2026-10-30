import { NodeCrypto, NodeHttpServer, NodeServices } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { Book, BookId, type CreateBookRequest } from "@goho/goho-api/books";
import * as Client from "@goho/goho-server-client/client";
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Result, Schema } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as BookRepository from "#src/books/repository.ts";
import * as Books from "#src/books/service.ts";
import * as CategoryRepository from "#src/categories/repository.ts";
import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";
import { behindOpenTransaction } from "#test/helpers/locks.ts";

const hobbit: CreateBookRequest = {
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: "Fiction",
  readingLevel: "Grade 4",
};

const RepositoriesLive = BookRepository.layer.pipe(Layer.provideMerge(CategoryRepository.layer));

// Each test owns a schema and pool, so concurrent saves use separate connections.
const databaseMigratedBy = <E, R>(migrate: Effect.Effect<unknown, E, R>) =>
  Layer.effectContext(
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
      yield* migrate.pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
      return services;
    }),
  ).pipe(Layer.provide(NodeCrypto.layer));

const DatabaseLive = databaseMigratedBy(Migrations.run());

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

it.effect("enforces book identity in the database", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const insertBook = (
      title: string,
      author: string | null,
      readingLevel: string | null = null,
    ) => sql`
      INSERT INTO books (title, author, category_id, reading_level)
      SELECT ${title}, ${author}, id, ${readingLevel} FROM categories WHERE name = 'fiction'
    `;
    yield* insertBook("The Hobbit", "J. R. R. Tolkien");
    // A different author is a different book.
    yield* insertBook("The Hobbit", "Someone Else");
    // An unknown author is another book, but only one per title.
    yield* insertBook("The Hobbit", null);
    for (const attempt of [
      insertBook(" the  HOBBIT\t", "j. r. r.   tolkien "),
      insertBook("THE HOBBIT ", null),
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
      { title: "The Hobbit", author: null },
    ]);
    // A referenced category cannot be deleted.
    expect(
      Result.isFailure(yield* Effect.result(sql`DELETE FROM categories WHERE name = 'fiction'`)),
    ).toBe(true);
  }).pipe(Effect.provide(DatabaseLive)),
);

const BeforeOptionalAuthorLive = databaseMigratedBy(
  PgMigrator.run({
    loader: PgMigrator.fromRecord(
      Object.fromEntries(Object.entries(Migrations.all).filter(([id]) => id < "0018")),
    ),
    table: "goho_migrations",
  }),
);

it.effect("upgrades saved books and covers unchanged to allow unknown authors", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const migrationIds = sql<{ id: number }>`
      SELECT migration_id AS id FROM goho_migrations ORDER BY migration_id
    `.pipe(Effect.map((rows) => rows.map(({ id }) => id)));
    expect((yield* migrationIds).at(-1)).toBe(16);
    yield* sql`
      INSERT INTO books (title, author, category_id, reading_level)
      SELECT title, author, id, level FROM categories,
        (VALUES ('The Hobbit', 'J. R. R. Tolkien', 'Grade 4'), ('Beowulf', 'Anonymous', NULL))
          AS b(title, author, level)
      WHERE name = 'fiction'
    `;
    yield* sql`
      INSERT INTO book_uploads (
        id, file_id, file_name, content_type, status, book_id, is_cover,
        extraction_version, extracted_payload
      )
      SELECT gen_random_uuid(), 'stored', 'cover.png', 'image/png', 'succeeded', id, true, 1, '{}'
      FROM books WHERE title = 'The Hobbit'
    `;
    const snapshot = Effect.all([
      sql`SELECT * FROM books ORDER BY id`,
      sql`SELECT * FROM book_uploads ORDER BY id`,
    ]);
    const before = yield* snapshot;
    // Some databases already record an unrelated migration 0017; 0018 must still run.
    yield* sql`INSERT INTO goho_migrations (migration_id, name) VALUES (17, 'issued_upload_ids')`;
    expect(yield* Migrations.run().pipe(Effect.provide(NodeServices.layer))).toEqual([
      [18, "optional_book_author"],
    ]);
    expect((yield* migrationIds).slice(-2)).toEqual([17, 18]);
    expect(yield* snapshot).toEqual(before);

    const books = yield* BookRepository.Service;
    const [hobbitId, beowulfId] = (yield* sql<{ id: BookId }>`
      SELECT id::text AS id FROM books ORDER BY id
    `).map(({ id }) => id);
    expect(yield* books.findOrCreate(hobbit)).toMatchObject({ id: hobbitId, hasImage: true });
    // An unknown author is a new book next to the old ones, saved once.
    const unknown = yield* books.findOrCreate({ title: "Beowulf", category: "Fiction" });
    expect(unknown.id).not.toBe(beowulfId);
    expect(yield* books.findOrCreate({ title: "beowulf", category: "Fiction" })).toEqual(unknown);
  }).pipe(Effect.provide(BeforeOptionalAuthorLive)),
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
    // The loser runs inside a caller's transaction, as a scan's save does, so its
    // insert is a savepoint.
    const [winner, loser] = yield* behindOpenTransaction(
      books.findOrCreate(hobbit),
      sql.withTransaction(
        books.findOrCreate({
          title: "the hobbit",
          author: " J. R. R. TOLKIEN",
          category: "Brand New Shelf",
          readingLevel: "Grade 9",
        }),
      ),
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

it.effect("keeps one book per title without an author, even when saves race", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const known = yield* books.findOrCreate(hobbit);
    const beowulf = { title: "Beowulf", category: "Poetry" };
    // The loser waits on the winner's uncommitted unknown-author identity.
    const [winner, loser] = yield* behindOpenTransaction(
      books.findOrCreate(beowulf),
      books.findOrCreate({ title: " BEOWULF", author: null, category: "Brand New Shelf" }),
      "INSERT INTO books",
    );
    expect(winner).toMatchObject({ title: "Beowulf", author: null, readingLevel: null });
    expect(loser).toEqual(winner);
    expect(yield* categoryNamed("brand new shelf")).toBeUndefined();
    // Unknown and known authors stay apart either way round.
    const unknownHobbit = yield* books.findOrCreate({ ...hobbit, author: null });
    expect(unknownHobbit.id).not.toBe(known.id);
    expect(unknownHobbit.author).toBeNull();
    expect(yield* books.findOrCreate({ ...hobbit, title: "the hobbit" })).toEqual(known);
    expect(yield* books.findOrCreate({ title: "The Hobbit", category: "Fiction" })).toEqual(
      unknownHobbit,
    );
    const translated = yield* books.findOrCreate({ ...beowulf, author: "Seamus Heaney" });
    expect(translated.id).not.toBe(winner.id);
    expect(yield* sql`SELECT count(*)::int AS count FROM books`).toEqual([{ count: 4 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("finds title and author matches literally, newest first", () =>
  Effect.gen(function* () {
    const books = yield* BookRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const save = (title: string, author: string | null) =>
      books
        .findOrCreate({ title, author, category: "Fiction" })
        .pipe(Effect.map((book) => book.id));
    const percent = yield* save("100% Cotton", "Ann Weaver");
    const underscore = yield* save("Cotton Fields", "A_B Writer");
    const question = yield* save("What? Where!", "Mary   Jones");
    const plain = yield* save("Plain Title", "Plain Author");
    const unknown = yield* save("Unknown Cotton", null);
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

    const everything = [percent, unknown, plain, question, underscore];
    expect(yield* search("")).toEqual(everything);
    expect(yield* search("   ")).toEqual(everything);
    expect(yield* search("%")).toEqual([percent]);
    expect(yield* search("_")).toEqual([underscore]);
    expect(yield* search("a_b")).toEqual([underscore]);
    expect(yield* search("?")).toEqual([question]);
    // A book without an author still matches by title.
    expect(yield* search("COTTON")).toEqual([percent, unknown, underscore]);
    expect(yield* search("writer")).toEqual([underscore]);
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
    // Null clears the author, and a later correction can name one again.
    const anonymous = Option.getOrThrow(yield* books.update(bookId, { author: null }));
    expect(anonymous).toEqual({ ...cleared, author: null });
    expect(yield* books.findOrCreate({ ...hobbit, author: null })).toEqual(anonymous);
    expect(Option.getOrThrow(yield* books.update(bookId, { author: original.author }))).toEqual(
      cleared,
    );
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
    const unknown = yield* books.findOrCreate({ title: "Roverandom", category: "Fiction" });
    const before = yield* tables;
    for (const [bookId, changes] of [
      [other.id, { title: " the  hobbit " }],
      [other.id, { title: "The Hobbit", category: "Brand New Shelf", readingLevel: null }],
      // Without an author, a title can still belong to one book only.
      [other.id, { title: "roverandom", author: null }],
      [unknown.id, { author: "J. R. R. Tolkien", title: "The Silmarillion" }],
    ] as const) {
      const result = yield* books.update(bookId, changes).pipe(Effect.result);
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
    expect(yield* books.delete(bookId)).toEqual(Option.some([]));
    expect(yield* books.delete(bookId)).toEqual(Option.none());
    expect(yield* books.findById(bookId)).toEqual(Option.none());
    expect((yield* books.list("")).map(({ id }) => id)).toEqual([retained]);
    expect(yield* categoryNamed("fantasy")).toMatchObject({ kinds: ["book"] });
  }).pipe(Effect.provide(DatabaseLive)),
);

// Books without scans have no files, so storage must stay untouched.
const HttpDatabaseLive = HttpRouter.serve(
  Http.layer.pipe(
    Layer.provide([
      Books.layer.pipe(Layer.provide([Transaction.layer, Layer.mock(FileStorage.Service, {})])),
      Layer.mock(Receipts.Service, {}),
      Layer.mock(ReceiptUploads.Service, {}),
      Layer.mock(BookUploads.Service, {}),
    ]),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(DatabaseLive));

it.effect("serves saved books over HTTP with one Book shape and domain errors", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    // The typed client encodes already-trimmed values, so wire trimming uses a raw request.
    const created = yield* HttpClient.post("/books", {
      body: yield* HttpBody.json({
        title: "  The Hobbit ",
        author: "J. R. R. Tolkien",
        category: " Fiction ",
        readingLevel: "Grade 4",
      }),
    });
    expect(created.status).toBe(200);
    const { data: book } = yield* created.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ data: Book }))),
    );
    const expected = {
      id: book.id,
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      category: yield* categoryNamed("fiction"),
      readingLevel: "Grade 4",
      hasImage: false,
    };
    expect(book).toEqual(expected);
    // A duplicate returns the saved book as it is and adds no category.
    expect(
      yield* client.books.create({
        payload: { title: "the hobbit", author: "j. r. r. tolkien", category: "Poetry" },
      }),
    ).toEqual({ data: expected });
    expect(yield* categoryNamed("poetry")).toBeUndefined();
    expect(yield* client.books.get({ params: { bookId: book.id } })).toEqual({ data: expected });
    expect(yield* client.books.list({ query: {} })).toEqual({ data: [expected] });
    expect(yield* client.books.list({ query: { search: "TOLKIEN" } })).toEqual({
      data: [expected],
    });
    expect(yield* client.books.list({ query: { search: "silmarillion" } })).toEqual({ data: [] });

    // A book without an author answers with null and doesn't trip up search.
    const unknown = yield* HttpClient.post("/books", {
      body: yield* HttpBody.json({ title: "Beowulf", category: "Fiction" }),
    });
    const { data: anonymous } = yield* unknown.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ data: Book }))),
    );
    expect(anonymous.author).toBeNull();
    expect(yield* client.books.list({ query: { search: "tolkien" } })).toEqual({
      data: [expected],
    });
    expect(yield* client.books.list({ query: { search: "beowulf" } })).toEqual({
      data: [anonymous],
    });
    expect(yield* client.books.delete({ params: { bookId: anonymous.id } })).toBeUndefined();

    const { data: other } = yield* client.books.create({
      payload: { title: "The Silmarillion", author: "J. R. R. Tolkien", category: "Fiction" },
    });
    expect(other.readingLevel).toBeNull();
    const collision = yield* HttpClient.patch(`/books/${other.id}`, {
      body: yield* HttpBody.json({ title: "THE HOBBIT", category: "Brand New Shelf" }),
    });
    expect(collision.status).toBe(409);
    expect(yield* collision.json).toEqual({ _tag: "BookConflict" });
    expect(yield* categoryNamed("brand new shelf")).toBeUndefined();

    expect(
      yield* client.books.patch({ params: { bookId: book.id }, payload: { readingLevel: null } }),
    ).toEqual({ data: { ...expected, readingLevel: null } });

    expect(yield* client.books.delete({ params: { bookId: book.id } })).toBeUndefined();
    for (const response of [
      yield* HttpClient.get(`/books/${book.id}`),
      yield* HttpClient.del(`/books/${book.id}`),
      yield* HttpClient.patch(`/books/${book.id}`, {
        body: yield* HttpBody.json({ title: "Gone" }),
      }),
    ]) {
      expect(response.status).toBe(404);
      expect(yield* response.json).toEqual({ _tag: "BookNotFound" });
    }
    expect(yield* client.books.list({ query: {} })).toEqual({ data: [other] });
  }).pipe(Effect.provide(HttpDatabaseLive)),
);
