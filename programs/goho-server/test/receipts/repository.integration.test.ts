import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { CreateReceiptRequest, IdempotencyKey, ReceiptId } from "@goho/goho-api/receipts";
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Result } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import receiptsMigration from "#src/database/migrations/0001-receipts.ts";
import createReceiptMigration from "#src/database/migrations/0002-create-receipt.ts";
import * as Repository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";

import { parsedReceipt, receipt } from "./fixtures.ts";

const idempotencyKey = IdempotencyKey.make("manual-entry-1");
const receiptInput = CreateReceiptRequest.make({
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  category: "Groceries",
  subtotal: "10.250",
  tax: "7.5e-1",
  total: "11.00",
  currency: null,
  items: [
    { name: "Apples", amount: "12.00" },
    { name: "Adjustment", amount: "-1.0" },
  ],
});

// Each test owns a schema and pool. Cleanup cannot touch development tables or
// other test runs, and concurrent saves use actual separate pool connections.
const DatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const crypto = yield* Crypto.Crypto;
    const schema = `test_${(yield* crypto.randomUUIDv4).replaceAll("-", "")}`;
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
).pipe(Layer.provide(NodeCrypto.layer));

const ServiceLive = Receipts.layer.pipe(
  Layer.provideMerge(DatabaseLive),
  Layer.provide(NodeCrypto.layer),
);

const createManual = (key: typeof idempotencyKey, input: typeof receiptInput) =>
  Receipts.Service.pipe(Effect.flatMap((service) => service.create(key, input)));

const saveExtracted = (input: typeof receipt) =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const inserted = yield* repo.insertExtracted(input);
        if (Option.isNone(inserted)) {
          return {
            _tag: "AlreadyExists" as const,
            receiptId: yield* repo.findBySource(input.source),
          };
        }
        yield* repo.insertItems(inserted.value, input.items);
        return { _tag: "Inserted" as const, receiptId: inserted.value };
      }),
    );
  });

const LegacyDatabaseLive = Layer.effectContext(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("TEST_DATABASE_URL");
    const adminContext = yield* Layer.build(Postgres.layer({ url }));
    const admin = Context.get(adminContext, SqlClient.SqlClient);
    const crypto = yield* Crypto.Crypto;
    const schema = `test_${(yield* crypto.randomUUIDv4).replaceAll("-", "")}`;
    yield* Effect.acquireRelease(admin`CREATE SCHEMA ${admin(schema)}`, () =>
      admin`DROP SCHEMA ${admin(schema)} CASCADE`.pipe(Effect.orDie),
    );
    const testUrl = new URL(Redacted.value(url));
    const options = testUrl.searchParams.get("options") ?? "";
    testUrl.searchParams.set("options", `${options} -c search_path=${schema}`.trim());
    const services = yield* Layer.build(Postgres.layer({ url: Redacted.make(testUrl.toString()) }));
    yield* PgMigrator.run({
      loader: PgMigrator.fromRecord({
        "0001_receipts": receiptsMigration,
        "0002_create_receipt": createReceiptMigration,
      }),
      table: "goho_migrations",
    }).pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
).pipe(Layer.provide(NodeCrypto.layer));

it.effect("applies migrations from empty and does not reapply completed migrations", () =>
  Effect.gen(function* () {
    const applied = yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));
    expect(applied).toEqual([]);
    const sql = yield* SqlClient.SqlClient;
    expect(yield* sql`SELECT name FROM goho_migrations`).toEqual([
      { name: "receipts" },
      { name: "create_receipt" },
      { name: "bigint_receipt_ids" },
      { name: "receipt_uploads" },
      { name: "receipt_upload_file_id" },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("migrates populated UUID receipts to BIGINT identities without losing items", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO receipts (
        id, store_name, receipt_date, category, subtotal, tax, total, currency
      ) VALUES (
        '00000000-0000-4000-8000-000000000001', 'Legacy Store', '2026-09-01',
        'Groceries', 10, 1, 11, 'CAD'
      )
    `;
    yield* sql`
      INSERT INTO receipt_items (id, receipt_id, position, name, amount)
      VALUES (
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001', 0, 'Apples', 11
      )
    `;

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    expect(yield* sql`SELECT id::text AS id, store_name FROM receipts`).toEqual([
      { id: "1", store_name: "Legacy Store" },
    ]);
    expect(
      yield* sql`
        SELECT receipt_id::text AS receipt_id, position, name
        FROM receipt_items
      `,
    ).toEqual([{ receipt_id: "1", position: 0, name: "Apples" }]);
    expect(
      yield* sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('receipts', 'receipt_items')
          AND data_type = 'uuid'
      `,
    ).toEqual([]);
    expect(
      yield* sql`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'receipts'
          AND column_name = 'id'
      `,
    ).toEqual([{ data_type: "bigint" }]);
    expect(
      yield* sql`
        INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total, currency)
        VALUES ('New Store', '2026-09-02', 'Groceries', 20, 2, 22, 'CAD')
        RETURNING id::text AS id
      `,
    ).toEqual([{ id: "2" }]);
  }).pipe(Effect.provide(LegacyDatabaseLive)),
);

it.effect("returns an empty receipt list", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    expect(yield* repo.list).toEqual([]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("finds one receipt and returns none for a missing ID", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const created = yield* createManual(idempotencyKey, receiptInput);
    expect(yield* repo.findById(created.id)).toEqual(Option.some(created));
    expect(yield* repo.findById(ReceiptId.make("999"))).toEqual(Option.none());
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("lists complete receipts newest first with ordered items", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const earlierCreated = {
      ...receipt,
      source: { ...receipt.source, fileId: "same-date-first", fileName: "first.png" },
      storeName: "First same-date receipt",
    };
    const laterCreated = {
      ...receipt,
      source: { ...receipt.source, fileId: "same-date-second", fileName: "second.png" },
      storeName: "Second same-date receipt",
    };
    const earlierCreatedSaved = yield* saveExtracted(earlierCreated);
    const laterCreatedSaved = yield* saveExtracted(laterCreated);
    const olderInsertedLast = yield* createManual(idempotencyKey, receiptInput);
    yield* sql`
      UPDATE receipts SET created_at = CASE id
        WHEN ${earlierCreatedSaved.receiptId} THEN '2026-09-01T00:00:00Z'::timestamptz
        WHEN ${laterCreatedSaved.receiptId} THEN '2026-09-02T00:00:00Z'::timestamptz
        WHEN ${olderInsertedLast.id} THEN '2026-09-03T00:00:00Z'::timestamptz
        ELSE created_at
      END
    `;
    expect(yield* repo.list).toEqual([
      {
        id: laterCreatedSaved.receiptId,
        storeName: laterCreated.storeName,
        receiptDate: laterCreated.receiptDate,
        category: laterCreated.category,
        subtotal: laterCreated.subtotal,
        tax: laterCreated.tax,
        total: laterCreated.total,
        currency: laterCreated.currency,
        items: laterCreated.items,
      },
      {
        id: earlierCreatedSaved.receiptId,
        storeName: earlierCreated.storeName,
        receiptDate: earlierCreated.receiptDate,
        category: earlierCreated.category,
        subtotal: earlierCreated.subtotal,
        tax: earlierCreated.tax,
        total: earlierCreated.total,
        currency: earlierCreated.currency,
        items: earlierCreated.items,
      },
      olderInsertedLast,
    ]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("creates a complete receipt and replays an equivalent normalized request", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const created = yield* createManual(idempotencyKey, receiptInput);
    expect(created).toEqual({
      id: created.id,
      storeName: "Example Store",
      receiptDate: "2024-09-01",
      category: "Groceries",
      subtotal: "10.25",
      tax: "0.75",
      total: "11",
      currency: null,
      items: [
        { position: 0, name: "Apples", amount: "12" },
        { position: 1, name: "Adjustment", amount: "-1" },
      ],
    });
    const replayed = yield* createManual(
      idempotencyKey,
      CreateReceiptRequest.make({
        ...receiptInput,
        subtotal: "1.025e1",
        tax: "0.7500",
        total: "11.0",
        items: [
          { name: "Apples", amount: "12.0" },
          { name: "Adjustment", amount: "-1.00" },
        ],
      }),
    );
    expect(replayed).toEqual(created);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 1 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 2 }]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("rejects reuse of an idempotency key for different normalized data", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const created = yield* createManual(idempotencyKey, receiptInput);
    const result = yield* createManual(
      idempotencyKey,
      CreateReceiptRequest.make({ ...receiptInput, total: "12" }),
    ).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("Conflict");
    expect(yield* sql`SELECT total::text FROM receipts WHERE id = ${created.id}`).toEqual([
      { total: "11" },
    ]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 2 }]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("concurrent equivalent creates return one receipt and item set", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const results = yield* Effect.all(
      [createManual(idempotencyKey, receiptInput), createManual(idempotencyKey, receiptInput)],
      { concurrency: 2 },
    );
    expect(results[0]).toEqual(results[1]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 1 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 2 }]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("rolls back a service-created receipt when an item insert fails", () =>
  Effect.gen(function* () {
    const service = yield* Receipts.Service;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`ALTER TABLE receipt_items ADD CONSTRAINT reject_adjustments CHECK (name <> 'Adjustment')`;

    const result = yield* service.create(idempotencyKey, receiptInput).pipe(Effect.result);

    expect(Result.isFailure(result) && result.failure._tag).toBe("InternalServerError");
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("persists receipt totals, provenance, repeated items and exact decimal amounts", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const result = yield* saveExtracted(receipt);
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
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("retains the first saved receipt and does not duplicate its items", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const first = yield* saveExtracted(receipt);
    const second = yield* saveExtracted({ ...receipt, storeName: "Changed Store" });
    expect(second).toEqual({ _tag: "AlreadyExists", receiptId: first.receiptId });
    expect(yield* sql`SELECT store_name FROM receipts`).toEqual([{ store_name: "Example Store" }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 3 }]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("concurrent saves of one source create only one receipt and item set", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const results = yield* Effect.all([saveExtracted(receipt), saveExtracted(receipt)], {
      concurrency: 2,
    });
    expect(results.map((result) => result._tag).sort()).toEqual(["AlreadyExists", "Inserted"]);
    expect(results[0].receiptId).toBe(results[1].receiptId);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 1 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 3 }]);
  }).pipe(Effect.provide(ServiceLive)),
);

it.effect("rolls back the receipt when an item insert fails", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`ALTER TABLE receipt_items ADD CONSTRAINT reject_adjustments CHECK (name <> 'Adjustment')`;
    const result = yield* saveExtracted(receipt).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe(
      "GohoServer.ReceiptRepository.PersistenceError",
    );
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
  }).pipe(Effect.provide(ServiceLive)),
);
