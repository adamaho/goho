import { randomUUID } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { Config, Context, Effect, Layer, Redacted, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "../../src/database/migrations.ts";
import * as Repository from "../../src/receipts/repository.ts";
import { parsedReceipt, receipt } from "./fixtures.ts";

// Each test owns a schema and pool. Cleanup cannot touch development tables or
// other test runs, and concurrent saves use actual separate pool connections.
const DatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    yield* Effect.acquireRelease(admin`CREATE SCHEMA ${admin(schema)}`, () =>
      admin`DROP SCHEMA ${admin(schema)} CASCADE`.pipe(Effect.orDie),
    );
    const testUrl = new URL(Redacted.value(url));
    const options = testUrl.searchParams.get("options") ?? "";
    testUrl.searchParams.set("options", `${options} -c search_path=${schema}`.trim());
    const services = yield* Layer.build(
      Repository.layer.pipe(
        Layer.provideMerge(Postgres.layer({ url: Redacted.make(testUrl.toString()) })),
      ),
    );
    yield* Migrations.run().pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
);

it.effect("applies migrations from empty and does not reapply completed migrations", () =>
  Effect.gen(function* () {
    const applied = yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));
    expect(applied).toEqual([]);
    const sql = yield* SqlClient.SqlClient;
    expect(yield* sql`SELECT name FROM goho_migrations`).toEqual([{ name: "receipts" }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("persists receipt totals, provenance, repeated items and exact decimal amounts", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const result = yield* repo.save(receipt);
    expect(result._tag).toBe("Inserted");
    expect(
      yield* sql`
      SELECT source_provider, source_file_id, source_file_name, store_name,
        receipt_date::text, category, subtotal, tax, total, currency,
        extraction_version, extracted_payload
      FROM receipts WHERE id = ${result.receiptId}
    `,
    ).toEqual([
      {
        source_provider: "google_drive",
        source_file_id: "receipt-1",
        source_file_name: "receipt.png",
        store_name: "Example Store",
        receipt_date: "2026-09-01",
        category: "Groceries",
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        currency: null,
        extraction_version: 1,
        extracted_payload: parsedReceipt,
      },
    ]);
    expect(
      yield* sql`
      SELECT position, name, amount FROM receipt_items
      WHERE receipt_id = ${result.receiptId} ORDER BY position
    `,
    ).toEqual([
      { position: 0, name: "Apples", amount: "0.3333333333333333" },
      { position: 1, name: "Apples", amount: "0.3333333333333333" },
      { position: 2, name: "Adjustment", amount: "-1" },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("retains the first saved receipt and does not duplicate its items", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const first = yield* repo.save(receipt);
    const second = yield* repo.save({ ...receipt, storeName: "Changed Store" });
    expect(second).toEqual({ _tag: "AlreadyExists", receiptId: first.receiptId });
    expect(yield* sql`SELECT store_name FROM receipts`).toEqual([{ store_name: "Example Store" }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 3 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("concurrent saves of one source create only one receipt and item set", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const results = yield* Effect.all([repo.save(receipt), repo.save(receipt)], { concurrency: 2 });
    expect(results.map((result) => result._tag).sort()).toEqual(["AlreadyExists", "Inserted"]);
    expect(results[0].receiptId).toBe(results[1].receiptId);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 1 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 3 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rolls back the receipt when an item insert fails", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`ALTER TABLE receipt_items ADD CONSTRAINT reject_adjustments CHECK (name <> 'Adjustment')`;
    const result = yield* repo.save(receipt).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe(
      "@goho/GohoServer.ReceiptRepository.PersistenceError",
    );
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);
