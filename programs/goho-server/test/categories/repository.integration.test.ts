import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { Config, Context, Crypto, Effect, Layer, Redacted, Result } from "effect";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as CategoryRepository from "#src/categories/repository.ts";
import * as Migrations from "#src/database/migrations.ts";
import { behindOpenTransaction } from "#test/helpers/locks.ts";

const RepositoriesLive = CategoryRepository.layer;

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

it.effect("enforces category kinds in the database", () =>
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
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("shares one category across kinds, adding each kind once and keeping its ID", () =>
  Effect.gen(function* () {
    const categories = yield* CategoryRepository.Service;
    const comics = yield* categories.findOrCreate("Comics", "receipt");
    expect(comics).toEqual({
      id: expect.any(String),
      name: "comics",
      icon: "other",
      color: "grey",
      kinds: ["receipt"],
    });
    const shared = { ...comics, kinds: ["receipt", "book"] };
    expect(yield* categories.findOrCreate(" COMICS ", "book")).toEqual(shared);
    expect(yield* categories.findOrCreate("comics", "receipt")).toEqual(shared);
    expect(yield* categoryNamed("comics")).toEqual(shared);

    // A book category used for a receipt also becomes a receipt category.
    const fiction = yield* categoryNamed("fiction");
    expect(yield* categories.findOrCreate("Fiction", "receipt")).toEqual({
      ...fiction,
      kinds: ["receipt", "book"],
    });
    expect(yield* categories.listNamesForCategory("book")).toEqual([
      "comics",
      "fiction",
      "nonfiction",
    ]);
    const receiptNames = yield* categories.listNamesForCategory("receipt");
    expect(receiptNames).toEqual(expect.arrayContaining(["comics", "fiction", "groceries"]));
    expect(receiptNames).not.toContain("nonfiction");
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
