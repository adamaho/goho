import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { CreateReceiptRequest, ReceiptId } from "@goho/goho-api/receipts";
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Result, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import receiptsMigration from "#src/database/migrations/0001-receipts.ts";
import createReceiptMigration from "#src/database/migrations/0002-create-receipt.ts";
import bigintReceiptIdsMigration from "#src/database/migrations/0003-bigint-receipt-ids.ts";
import receiptUploadsMigration from "#src/database/migrations/0004-receipt-uploads.ts";
import receiptUploadFileIdMigration from "#src/database/migrations/0005-receipt-upload-file-id.ts";
import dropReceiptIdempotencyMigration from "#src/database/migrations/0006-drop-receipt-idempotency.ts";
import moveExtractionToUploadsMigration from "#src/database/migrations/0007-move-extraction-to-uploads.ts";
import * as Repository from "#src/receipts/repository.ts";

import { parsedReceipt, receipt } from "./fixtures.ts";

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

// Builds a database migrated only through the given migrations, for upgrade tests.
const migratedDatabase = (migrations: Parameters<typeof PgMigrator.fromRecord>[0]) =>
  Layer.effectContext(
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
        Postgres.layer({ url: Redacted.make(testUrl.toString()) }),
      );
      yield* PgMigrator.run({
        loader: PgMigrator.fromRecord(migrations),
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
      { name: "drop_receipt_idempotency" },
      { name: "move_extraction_to_uploads" },
      { name: "default_receipt_currency" },
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
  }).pipe(
    Effect.provide(
      migratedDatabase({
        "0001_receipts": receiptsMigration,
        "0002_create_receipt": createReceiptMigration,
      }),
    ),
  ),
);

it.effect("backfills missing currency to CAD and preserves explicit currencies and amounts", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total, currency)
      VALUES
        ('Unknown currency', '2026-09-01', 'Groceries', 10.250, 0.75, 11.00, NULL),
        ('US Store', '2026-09-02', 'Groceries', 20, 2, 22, 'USD')
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount)
      SELECT id, 0, 'Apples', total FROM receipts
    `;

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    expect(
      yield* sql`
      SELECT r.currency, r.subtotal::text, r.tax::text, r.total::text, i.amount::text
      FROM receipts r JOIN receipt_items i ON i.receipt_id = r.id ORDER BY r.id
    `,
    ).toEqual([
      { currency: "CAD", subtotal: "10.250", tax: "0.75", total: "11.00", amount: "11.00" },
      { currency: "USD", subtotal: "20", tax: "2", total: "22", amount: "22" },
    ]);
    expect(
      yield* sql`
      INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total)
      VALUES ('Default Store', '2026-09-03', 'Groceries', 5, 1, 6)
      RETURNING currency
    `,
    ).toEqual([{ currency: "CAD" }]);
    expect(
      yield* sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'receipts' AND column_name = 'currency'
    `,
    ).toEqual([{ is_nullable: "NO" }]);
    expect(yield* Migrations.run().pipe(Effect.provide(NodeServices.layer))).toEqual([]);
  }).pipe(
    Effect.provide(
      migratedDatabase({
        "0001_receipts": receiptsMigration,
        "0002_create_receipt": createReceiptMigration,
        "0003_bigint_receipt_ids": bigintReceiptIdsMigration,
        "0004_receipt_uploads": receiptUploadsMigration,
        "0005_receipt_upload_file_id": receiptUploadFileIdMigration,
        "0006_drop_receipt_idempotency": dropReceiptIdempotencyMigration,
        "0007_move_extraction_to_uploads": moveExtractionToUploadsMigration,
      }),
    ),
  ),
);

it.effect("defaults null currency to CAD and preserves explicit currency on receipt creation", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    for (const currency of [null, "CAD", "USD", "XYZ"]) {
      const id = yield* repo.insert({ ...receiptInput, currency });
      const saved = Option.getOrThrow(yield* repo.findById(id));
      expect(saved.currency).toBe(currency ?? "CAD");
      expect((yield* repo.list).find((entry) => entry.id === id)).toEqual(saved);
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("returns an empty receipt list", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    expect(yield* repo.list).toEqual([]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("moves extraction results onto uploads and drops receipt source metadata", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const payload = JSON.stringify(parsedReceipt);
    const [uploaded] = yield* sql`
      INSERT INTO receipts (
        source_provider, source_file_id, source_file_name, store_name, receipt_date,
        category, subtotal, tax, total, extraction_version, extracted_payload
      ) VALUES (
        'file_storage', 'file-1', 'receipt.png', 'Uploaded Store', '2026-09-01',
        'Groceries', 10, 1, 11, 1, ${payload}::jsonb
      ) RETURNING id::text AS id
    `;
    yield* sql`
      INSERT INTO receipts (
        source_provider, source_file_id, source_file_name, store_name, receipt_date,
        category, subtotal, tax, total, extraction_version, extracted_payload
      ) VALUES (
        'google_drive', 'drive-1', 'drive.png', 'Drive Store', '2026-09-02',
        'Groceries', 20, 2, 22, 1, ${payload}::jsonb
      )
    `;
    yield* sql`
      INSERT INTO receipt_uploads (id, file_id, file_name, content_type, status, receipt_id)
      VALUES (
        '7d89d8f7-6f0c-4df2-a2a9-94771638ac99', 'file-1', 'receipt.png', 'image/png',
        'succeeded', ${uploaded!.id}
      )
    `;

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    expect(
      yield* sql`SELECT receipt_id::text AS receipt_id, extraction_version, extracted_payload FROM receipt_uploads`,
    ).toEqual([
      { receipt_id: uploaded!.id, extraction_version: 1, extracted_payload: parsedReceipt },
    ]);
    expect(yield* sql`SELECT store_name FROM receipts ORDER BY id`).toEqual([
      { store_name: "Uploaded Store" },
      { store_name: "Drive Store" },
    ]);
    expect(
      yield* sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'receipts'
        ORDER BY ordinal_position
      `,
    ).toEqual([
      { column_name: "store_name" },
      { column_name: "receipt_date" },
      { column_name: "category" },
      { column_name: "subtotal" },
      { column_name: "tax" },
      { column_name: "total" },
      { column_name: "currency" },
      { column_name: "created_at" },
      { column_name: "id" },
    ]);
  }).pipe(
    Effect.provide(
      migratedDatabase({
        "0001_receipts": receiptsMigration,
        "0002_create_receipt": createReceiptMigration,
        "0003_bigint_receipt_ids": bigintReceiptIdsMigration,
        "0004_receipt_uploads": receiptUploadsMigration,
        "0005_receipt_upload_file_id": receiptUploadFileIdMigration,
        "0006_drop_receipt_idempotency": dropReceiptIdempotencyMigration,
      }),
    ),
  ),
);

it.effect("finds one receipt and returns none for a missing ID", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const receiptId = yield* repo.insert(receiptInput);
    expect(yield* repo.findById(receiptId)).toEqual(
      Option.some({
        id: receiptId,
        storeName: "Example Store",
        receiptDate: "2024-09-01",
        category: "Groceries",
        subtotal: "10.250",
        tax: "0.75",
        total: "11.00",
        currency: "CAD",
        items: [
          { position: 0, name: "Apples", amount: "12.00" },
          { position: 1, name: "Adjustment", amount: "-1.0" },
        ],
      }),
    );
    expect(yield* repo.findById(ReceiptId.make("999"))).toEqual(Option.none());
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("lists complete receipts newest first with ordered items", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const first = yield* repo.insert({ ...receipt, storeName: "First same-date receipt" });
    const second = yield* repo.insert({ ...receipt, storeName: "Second same-date receipt" });
    const third = yield* repo.insert(receiptInput);
    yield* sql`
      UPDATE receipts SET created_at = CASE id
        WHEN ${first} THEN '2026-09-01T00:00:00Z'::timestamptz
        WHEN ${second} THEN '2026-09-02T00:00:00Z'::timestamptz
        WHEN ${third} THEN '2026-09-03T00:00:00Z'::timestamptz
        ELSE created_at
      END
    `;
    const expected = yield* Effect.forEach([second, first, third], (receiptId) =>
      repo.findById(receiptId).pipe(Effect.map(Option.getOrThrow)),
    );
    expect(yield* repo.list).toEqual(expected);
    expect(expected.map((saved) => saved.storeName)).toEqual([
      "Second same-date receipt",
      "First same-date receipt",
      "Example Store",
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("persists repeated items and exact decimal amounts", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* repo.insert(receipt);
    expect(
      yield* sql`
        SELECT store_name, receipt_date::text, category, subtotal, tax, total, currency
        FROM receipts WHERE id = ${receiptId}
      `,
    ).toEqual([
      {
        store_name: "Example Store",
        receipt_date: "2026-09-01",
        category: "Groceries",
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        currency: "CAD",
      },
    ]);
    expect(
      yield* sql`
        SELECT position, name, amount FROM receipt_items
        WHERE receipt_id = ${receiptId} ORDER BY position
      `,
    ).toEqual([
      { position: 0, name: "Apples", amount: "0.3333333333333333" },
      { position: 1, name: "Apples", amount: "0.3333333333333333" },
      { position: 2, name: "Adjustment", amount: "-1" },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("inserts a new receipt on every call", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const first = yield* repo.insert(receipt);
    const second = yield* repo.insert(receipt);
    expect(second).not.toBe(first);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 2 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 6 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rolls back the receipt when an item insert fails", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`ALTER TABLE receipt_items ADD CONSTRAINT reject_adjustments CHECK (name <> 'Adjustment')`;
    const result = yield* repo.insert(receipt).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe(
      "GohoServer.ReceiptRepository.PersistenceError",
    );
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

class LaterStepFailed extends Schema.TaggedError<LaterStepFailed>()(
  "GohoServer.Test.LaterStepFailed",
  {},
) {}

it.effect("joins the caller's transaction and rolls back with it", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const result = yield* sql
      .withTransaction(repo.insert(receipt).pipe(Effect.andThen(new LaterStepFailed())))
      .pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("GohoServer.Test.LaterStepFailed");
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
  }).pipe(Effect.provide(DatabaseLive)),
);
