import { NodeCrypto, NodeHttpServer, NodeServices } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { CreateReceiptRequest, ReceiptId, ReceiptItemId } from "@goho/goho-api/receipts";
import * as Client from "@goho/goho-server-client/client";
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Result, Schema } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import receiptsMigration from "#src/database/migrations/0001-receipts.ts";
import createReceiptMigration from "#src/database/migrations/0002-create-receipt.ts";
import bigintReceiptIdsMigration from "#src/database/migrations/0003-bigint-receipt-ids.ts";
import receiptUploadsMigration from "#src/database/migrations/0004-receipt-uploads.ts";
import receiptUploadFileIdMigration from "#src/database/migrations/0005-receipt-upload-file-id.ts";
import dropReceiptIdempotencyMigration from "#src/database/migrations/0006-drop-receipt-idempotency.ts";
import moveExtractionToUploadsMigration from "#src/database/migrations/0007-move-extraction-to-uploads.ts";
import defaultReceiptCurrencyMigration from "#src/database/migrations/0008-default-receipt-currency.ts";
import recordTimestampsMigration from "#src/database/migrations/0009-record-timestamps.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Worker from "#src/receipt-uploads/worker.ts";
import * as Repository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";

import { parsedReceipt, receipt } from "./fixtures.ts";

const receiptInput = CreateReceiptRequest.make({
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  category: "Groceries",
  subtotal: "10.250",
  tax: "7.5e-1",
  total: "11.00",
  currency: "CAD",
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
    const schema = `test_${(yield* crypto.randomUUIDv4()).replaceAll("-", "")}`;
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
      const schema = `test_${(yield* crypto.randomUUIDv4()).replaceAll("-", "")}`;
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

const itemIds = (receiptId: ReceiptId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ id: string }>`
      SELECT id::text FROM receipt_items WHERE receipt_id = ${receiptId} ORDER BY position
    `;
    return rows.map((row) => ReceiptItemId.make(row.id));
  });

// Shared by fresh and upgraded databases: identity, retained ordering key, and cascade.
const expectItemIdentitySchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  expect(
    yield* sql`
      SELECT data_type, is_nullable, is_identity, identity_generation
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'receipt_items' AND column_name = 'id'
    `,
  ).toEqual([
    { data_type: "bigint", is_nullable: "NO", is_identity: "YES", identity_generation: "ALWAYS" },
  ]);
  expect(
    yield* sql`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'receipt_items'::regclass AND contype IN ('p', 'u', 'f')
      ORDER BY conname
    `,
  ).toEqual([
    { conname: "receipt_items_pkey", definition: "PRIMARY KEY (id)" },
    {
      conname: "receipt_items_receipt_id_fkey",
      definition: "FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE",
    },
    {
      conname: "receipt_items_receipt_id_position_key",
      definition: 'UNIQUE (receipt_id, "position")',
    },
  ]);
});

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
      { name: "record_timestamps" },
      { name: "receipt_item_ids" },
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

it.effect("preserves the required currency on receipt creation", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    for (const currency of ["CAD", "USD", "XYZ"]) {
      const id = yield* repo.insert({ ...receiptInput, currency });
      const saved = Option.getOrThrow(yield* repo.findById(id));
      expect(saved.currency).toBe(currency);
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
    const { currency: _, ...transaction } = parsedReceipt.transaction;
    const legacyParsedReceipt = { ...parsedReceipt, transaction };
    const payload = JSON.stringify(legacyParsedReceipt);
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
      { receipt_id: uploaded!.id, extraction_version: 1, extracted_payload: legacyParsedReceipt },
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
      { column_name: "updated_at" },
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
    const [first, second] = yield* itemIds(receiptId);
    expect(first).not.toBe(second);
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
          { id: first, position: 0, name: "Apples", amount: "12.00" },
          { id: second, position: 1, name: "Adjustment", amount: "-1.0" },
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

const insertScannedReceipt = Effect.gen(function* () {
  const repo = yield* Repository.Service;
  const sql = yield* SqlClient.SqlClient;
  const receiptId = yield* repo.insert(receiptInput);
  yield* sql`
    INSERT INTO receipt_uploads (
      id, file_id, file_name, content_type, status, receipt_id, extraction_version, extracted_payload
    ) VALUES (
      '7d89d8f7-6f0c-4df2-a2a9-94771638ac99', 'stored-photo', 'receipt.png', 'image/png',
      'succeeded', ${receiptId}, 1, ${JSON.stringify(parsedReceipt)}::jsonb
    )
  `;
  return receiptId;
});

it.effect(
  "deletes manual and scanned receipts with their items and extraction, preserving other receipts",
  () =>
    Effect.gen(function* () {
      const repo = yield* Repository.Service;
      const sql = yield* SqlClient.SqlClient;
      const scanned = yield* insertScannedReceipt;
      const manual = yield* repo.insert(receiptInput);
      const retained = yield* repo.insert(receiptInput);
      expect(yield* repo.delete(scanned)).toEqual(Option.some({ fileId: "stored-photo" }));
      expect(yield* repo.delete(manual)).toEqual(Option.some({ fileId: null }));
      expect(yield* repo.delete(scanned)).toEqual(Option.none());
      expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual([]);
      expect(yield* sql`SELECT receipt_id::text AS receipt_id FROM receipt_items`).toEqual([
        { receipt_id: retained },
        { receipt_id: retained },
      ]);
      expect((yield* repo.list).map((entry) => entry.id)).toEqual([retained]);
    }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("serializes concurrent deletion of the same receipt", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const receiptId = yield* insertScannedReceipt;
    const results = yield* Effect.all([repo.delete(receiptId), repo.delete(receiptId)], {
      concurrency: 2,
    });
    expect(results.filter(Option.isSome)).toEqual([Option.some({ fileId: "stored-photo" })]);
    expect(results.filter(Option.isNone)).toHaveLength(1);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rolls back all receipt data when photo deletion fails, then completes on retry", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const before = yield* repo.findById(receiptId);
    const uploadsBefore = yield* sql`SELECT * FROM receipt_uploads`;
    let failCleanup = true;
    const service = yield* Receipts.Service.pipe(
      Effect.provide(
        Receipts.layer.pipe(
          Layer.provide(Transaction.layer),
          Layer.provide(
            Layer.succeed(FileStorage.Service, {
              put: () => Effect.die("Unexpected put"),
              get: () => Effect.die("Unexpected get"),
              delete: (fileId) =>
                Effect.suspend(() => {
                  expect(fileId).toBe("stored-photo");
                  return failCleanup
                    ? Effect.fail(
                        new FileStorage.StorageError({
                          operation: "delete",
                          cause: "test failure",
                        }),
                      )
                    : Effect.void;
                }),
            }),
          ),
        ),
      ),
    );
    const result = yield* service.delete(receiptId).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("InternalServerError");
    expect(yield* repo.findById(receiptId)).toEqual(before);
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(uploadsBefore);
    failCleanup = false;
    yield* service.delete(receiptId);
    expect(yield* repo.findById(receiptId)).toEqual(Option.none());
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual([]);
    expect(yield* sql`SELECT * FROM receipt_items`).toEqual([]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("backfills record timestamps without replacing historical receipt or upload dates", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO receipts (
        store_name, receipt_date, category, subtotal, tax, total, created_at
      ) VALUES ('Legacy Store', '2011-10-26', 'Groceries', 10, 1, 11, '2026-10-11T14:00:00Z')
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount)
      SELECT id, 0, 'Apples', 11 FROM receipts
    `;
    yield* sql`
      INSERT INTO receipt_uploads (
        id, file_id, file_name, content_type, status, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000001', 'legacy-photo', 'receipt.png',
        'image/png', 'processing', '2026-10-11T13:59:00Z', '2026-10-11T13:59:30Z'
      )
    `;

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    expect(
      yield* sql`
      SELECT receipt_date::text,
        created_at = '2026-10-11T14:00:00Z'::timestamptz AS original_creation,
        updated_at = created_at AS initial_update
      FROM receipts
    `,
    ).toEqual([{ receipt_date: "2011-10-26", original_creation: true, initial_update: true }]);
    expect(
      yield* sql`
      SELECT item.created_at = receipt.created_at AS inherited_creation,
        item.updated_at = item.created_at AS initial_update
      FROM receipt_items item JOIN receipts receipt ON receipt.id = item.receipt_id
    `,
    ).toEqual([{ inherited_creation: true, initial_update: true }]);
    expect(
      yield* sql`
      SELECT created_at = '2026-10-11T13:59:00Z'::timestamptz AS original_creation,
        updated_at = '2026-10-11T13:59:30Z'::timestamptz AS original_update
      FROM receipt_uploads
    `,
    ).toEqual([{ original_creation: true, original_update: true }]);
    expect(
      yield* sql`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN ('receipts', 'receipt_items', 'receipt_uploads')
        AND column_name IN ('created_at', 'updated_at')
      ORDER BY table_name, column_name
    `,
    ).toEqual(
      ["receipt_items", "receipt_uploads", "receipts"].flatMap((table_name) =>
        ["created_at", "updated_at"].map((column_name) => ({
          table_name,
          column_name,
          data_type: "timestamp with time zone",
          is_nullable: "NO",
          column_default: "now()",
        })),
      ),
    );
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
        "0008_default_receipt_currency": defaultReceiptCurrencyMigration,
      }),
    ),
  ),
);

it.effect("gives populated items unique BIGINT IDs without changing their data or history", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO receipts (
        store_name, receipt_date, category, subtotal, tax, total, created_at, updated_at
      ) VALUES
        ('First Store', '2026-10-01', 'Groceries', 11, 0, 11, '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z'),
        ('Second Store', '2026-10-03', 'Groceries', 5, 0, 5, '2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z')
    `;
    // Rows go in out of order with repeated names, so IDs cannot simply mirror positions.
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, created_at, updated_at)
      VALUES
        (2, 0, 'Apples', 5, '2026-10-03T12:00:00Z', '2026-10-05T12:00:00Z'),
        (1, 1, 'Apples', 0.3333333333333333, '2026-10-01T12:00:00Z', '2026-10-06T12:00:00Z'),
        (1, 0, 'Apples', 10.670, '2026-10-01T12:00:00Z', '2026-10-01T12:00:00Z')
    `;
    yield* sql`
      INSERT INTO receipt_uploads (
        id, file_id, file_name, content_type, status, receipt_id,
        extraction_version, extracted_payload, created_at, updated_at
      ) VALUES (
        '7d89d8f7-6f0c-4df2-a2a9-94771638ac99', 'stored-photo', 'receipt.png', 'image/png',
        'succeeded', 1, 1, ${JSON.stringify(parsedReceipt)}::jsonb,
        '2026-10-01T11:59:00Z', '2026-10-01T12:00:00Z'
      )
    `;
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts ORDER BY id`,
      sql`
        SELECT receipt_id, position, name, amount, created_at, updated_at
        FROM receipt_items ORDER BY receipt_id, position
      `,
      sql`SELECT * FROM receipt_uploads`,
    ]);
    const before = yield* snapshot;

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    // No row was updated, so neither data nor trigger-maintained timestamps moved.
    expect(yield* snapshot).toEqual(before);
    expect(
      yield* sql`
        SELECT updated_at = '2026-10-06T12:00:00Z'::timestamptz AS preserved
        FROM receipt_items WHERE receipt_id = 1 AND position = 1
      `,
    ).toEqual([{ preserved: true }]);
    yield* expectItemIdentitySchema;
    const ids = [
      ...(yield* itemIds(ReceiptId.make("1"))),
      ...(yield* itemIds(ReceiptId.make("2"))),
    ];
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);

    const repo = yield* Effect.provide(Repository.Service, Repository.layer);
    const migrated = Option.getOrThrow(yield* repo.findById(ReceiptId.make("1")));
    expect(migrated.items.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: ids[0], position: 0 },
      { id: ids[1], position: 1 },
    ]);
    const renamed = Option.getOrThrow(
      yield* repo.updateItem(ReceiptId.make("1"), ids[1]!, { name: "Pears" }),
    );
    expect(renamed.items.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: ids[0], name: "Apples" },
      { id: ids[1], name: "Pears" },
    ]);

    const [inserted] = yield* sql<{ id: string }>`
      INSERT INTO receipt_items (receipt_id, position, name, amount)
      VALUES (2, 1, 'Pears', 1) RETURNING id::text
    `;
    expect(ids.every((id) => BigInt(inserted!.id) > BigInt(id))).toBe(true);
    const duplicate = yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount) VALUES (2, 0, 'Again', 1)
    `.pipe(Effect.result);
    expect(Result.isFailure(duplicate)).toBe(true);
    yield* sql`DELETE FROM receipts WHERE id = 2`;
    expect(yield* sql`SELECT DISTINCT receipt_id::text FROM receipt_items`).toEqual([
      { receipt_id: "1" },
    ]);
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
        "0008_default_receipt_currency": defaultReceiptCurrencyMigration,
        "0009_record_timestamps": recordTimestampsMigration,
      }),
    ),
  ),
);

it.effect("generates distinct item IDs in sequence for receipts created on a fresh database", () =>
  Effect.gen(function* () {
    yield* expectItemIdentitySchema;
    const repo = yield* Repository.Service;
    const first = yield* repo.insert(receipt);
    const second = yield* repo.insert(receiptInput);
    const firstIds = yield* itemIds(first);
    const secondIds = yield* itemIds(second);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(5);
    expect(BigInt(secondIds[0]!)).toBeGreaterThan(BigInt(firstIds[2]!));
    expect(Option.getOrThrow(yield* repo.findById(first)).items.map(({ id }) => id)).toEqual(
      firstIds,
    );
    expect((yield* repo.list).map((saved) => saved.items.map(({ id }) => id))).toEqual([
      firstIds,
      secondIds,
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("keeps item IDs through renames and direct position changes", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* repo.insert(receiptInput);
    const [apples, adjustment] = yield* itemIds(receiptId);
    yield* repo.updateItem(receiptId, apples!, { name: "Pears" });
    expect(yield* itemIds(receiptId)).toEqual([apples, adjustment]);

    // No endpoint reorders items; swap positions directly through a free slot.
    yield* sql`UPDATE receipt_items SET position = 2 WHERE id = ${apples!}`;
    yield* sql`UPDATE receipt_items SET position = 0 WHERE id = ${adjustment!}`;
    yield* sql`UPDATE receipt_items SET position = 1 WHERE id = ${apples!}`;
    const renamed = yield* repo.updateItem(receiptId, apples!, { name: "Granny Smith apples" });
    expect(Option.getOrThrow(renamed).items).toEqual([
      { id: adjustment, position: 0, name: "Adjustment", amount: "-1.0" },
      { id: apples, position: 1, name: "Granny Smith apples", amount: "12.00" },
    ]);
    expect(yield* repo.findById(receiptId)).toEqual(renamed);
  }).pipe(Effect.provide(DatabaseLive)),
);

const UploadProcessingLive = Layer.mergeAll(
  ReceiptUploadRepository.layer,
  Transaction.layer,
  Layer.succeed(FileStorage.Service, {
    put: () => Effect.die("Unexpected put"),
    get: () => Effect.succeed(new Uint8Array([1, 2, 3])),
    delete: () => Effect.die("Unexpected delete"),
  }),
  Layer.succeed(Ai.Service, {
    generateObject: ({ schema }) =>
      Schema.decodeUnknownEffect(schema)(parsedReceipt).pipe(Effect.orDie),
  }),
).pipe(Layer.provideMerge(DatabaseLive));

it.effect("assigns item IDs to processed uploads and keeps their extraction evidence", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const uploads = yield* ReceiptUploadRepository.Service;
    const uploadId = ReceiptUploadId.make("7d89d8f7-6f0c-4df2-a2a9-94771638ac99");
    yield* uploads.createQueued({
      id: uploadId,
      fileId: FileStorage.FileId.make("stored-photo"),
      fileName: "receipt.png",
      contentType: "image/png",
    });
    yield* Worker.process({ uploadId }, { id: uploadId, attempts: 1 });

    const upload = Option.getOrThrow(yield* uploads.findById(uploadId));
    expect(upload.status).toBe("succeeded");
    const receiptId = upload.receiptId!;
    const saved = Option.getOrThrow(yield* repo.findById(receiptId));
    const ids = yield* itemIds(receiptId);
    expect(new Set(ids).size).toBe(3);
    expect(saved.items.map(({ id, position, name }) => ({ id, position, name }))).toEqual([
      { id: ids[0], position: 0, name: "Apples" },
      { id: ids[1], position: 1, name: "Apples" },
      { id: ids[2], position: 2, name: "Adjustment" },
    ]);

    const sql = yield* SqlClient.SqlClient;
    const extraction = sql`SELECT extraction_version, extracted_payload FROM receipt_uploads`;
    const evidence = yield* extraction;
    expect(evidence).toEqual([{ extraction_version: 1, extracted_payload: parsedReceipt }]);
    yield* repo.updateItem(receiptId, ids[0]!, { name: "Granny Smith apples" });
    expect(yield* extraction).toEqual(evidence);
  }).pipe(Effect.provide(UploadProcessingLive)),
);

it.effect(
  "defaults timestamps and preserves creation instants on direct updates in any time zone",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`SET LOCAL TIME ZONE 'America/Toronto'`;
          yield* sql`
        INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total)
        VALUES ('Example Store', '2011-10-26', 'Groceries', 10, 1, 11)
      `;
          yield* sql`
        INSERT INTO receipt_items (receipt_id, position, name, amount)
        SELECT id, 0, 'Apples', 11 FROM receipts
      `;
          yield* sql`
        INSERT INTO receipt_uploads (id, file_id, file_name, content_type, status)
        VALUES ('00000000-0000-4000-8000-000000000001', 'photo', 'receipt.png', 'image/png', 'queued')
      `;
          for (const table of ["receipts", "receipt_items", "receipt_uploads"]) {
            expect(
              yield* sql`
          SELECT created_at = now() AS creation_default,
            updated_at >= created_at AS valid_update
          FROM ${sql(table)}
        `,
            ).toEqual([{ creation_default: true, valid_update: true }]);
            expect(
              yield* sql`
          UPDATE ${sql(table)} SET created_at = '2000-01-01T00:00:00Z', updated_at = '2000-01-01T00:00:00Z'
          RETURNING created_at = now() AS creation_preserved,
            updated_at = statement_timestamp() AS update_recorded
        `,
            ).toEqual([{ creation_preserved: true, update_recorded: true }]);
          }
          expect(yield* sql`SELECT receipt_date::text FROM receipts`).toEqual([
            { receipt_date: "2011-10-26" },
          ]);
        }),
      );
    }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("touches only affected parents for item inserts, edits, moves and deletes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total)
      VALUES
        ('First Store', '2026-10-11', 'Groceries', 10, 1, 11),
        ('Second Store', '2026-10-11', 'Groceries', 10, 1, 11),
        ('Unrelated Store', '2026-10-11', 'Groceries', 10, 1, 11)
    `;
    const snapshot = sql<{ id: number; created_at: string; updated_at: string }>`
      SELECT id::int, created_at::text, updated_at::text FROM receipts ORDER BY id
    `;
    const changes = [
      {
        affected: [1],
        run: sql`INSERT INTO receipt_items (receipt_id, position, name, amount) VALUES (1, 0, 'Apples', 11)`,
      },
      { affected: [1], run: sql`UPDATE receipt_items SET name = 'Pears', amount = 12` },
      { affected: [1, 2], run: sql`UPDATE receipt_items SET receipt_id = 2` },
      { affected: [2], run: sql`DELETE FROM receipt_items` },
    ];
    for (const change of changes) {
      const before = yield* snapshot;
      yield* change.run;
      const after = yield* snapshot;
      expect(after.map(({ id, created_at }) => ({ id, created_at }))).toEqual(
        before.map(({ id, created_at }) => ({ id, created_at })),
      );
      for (const id of [1, 2, 3]) {
        if (change.affected.includes(id)) {
          expect(after.find((row) => row.id === id)).not.toEqual(
            before.find((row) => row.id === id),
          );
        } else {
          expect(after.find((row) => row.id === id)).toEqual(before.find((row) => row.id === id));
        }
      }
    }

    yield* sql`INSERT INTO receipt_items (receipt_id, position, name, amount) VALUES (1, 0, 'Apples', 11)`;
    const parentsBefore = yield* snapshot;
    const itemsBefore = yield* sql`SELECT * FROM receipt_items`;
    const rolledBack = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`UPDATE receipt_items SET name = 'Should roll back'`;
          return yield* new LaterStepFailed();
        }),
      )
      .pipe(Effect.result);
    expect(Result.isFailure(rolledBack) && rolledBack.failure._tag).toBe(
      "GohoServer.Test.LaterStepFailed",
    );
    expect(yield* snapshot).toEqual(parentsBefore);
    expect(yield* sql`SELECT * FROM receipt_items`).toEqual(itemsBefore);

    yield* sql`DELETE FROM receipts`;
    expect(yield* sql`SELECT * FROM receipt_items`).toEqual([]);
  }).pipe(Effect.provide(DatabaseLive)),
);

const receiptTimes = (receiptId: ReceiptId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [row] = yield* sql<{ created_at: string; updated_at: string }>`
      SELECT created_at::text, updated_at::text FROM receipts WHERE id = ${receiptId}
    `;
    return row!;
  });

const itemTimes = (receiptId: ReceiptId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{ position: number; created_at: string; updated_at: string }>`
      SELECT position, created_at::text, updated_at::text
      FROM receipt_items WHERE receipt_id = ${receiptId} ORDER BY position
    `;
  });

it.effect(
  "corrects only supplied receipt fields and preserves amounts, items, and extraction",
  () =>
    Effect.gen(function* () {
      const repo = yield* Repository.Service;
      const sql = yield* SqlClient.SqlClient;
      const receiptId = yield* insertScannedReceipt;
      const other = yield* repo.insert(receiptInput);
      const original = Option.getOrThrow(yield* repo.findById(receiptId));
      const otherBefore = yield* repo.findById(other);
      const uploadsBefore = yield* sql`SELECT * FROM receipt_uploads`;
      const itemsBefore = yield* itemTimes(receiptId);

      let expected = original;
      for (const changes of [
        { receiptDate: "2024-09-02" },
        { storeName: "Corner Store", category: "Snacks" },
        { storeName: "Main Street Market" },
        { category: "Household" },
      ]) {
        const before = yield* receiptTimes(receiptId);
        expected = { ...expected, ...changes };
        const saved = yield* repo.update(receiptId, changes);
        expect(saved).toEqual(Option.some(expected));
        expect(yield* repo.findById(receiptId)).toEqual(saved);
        expect((yield* repo.list).find((entry) => entry.id === receiptId)).toEqual(
          Option.getOrThrow(saved),
        );
        const after = yield* receiptTimes(receiptId);
        expect(after.created_at).toBe(before.created_at);
        expect(after.updated_at).not.toBe(before.updated_at);
      }

      expect(expected).toEqual({
        ...original,
        storeName: "Main Street Market",
        receiptDate: "2024-09-02",
        category: "Household",
      });
      expect(yield* itemTimes(receiptId)).toEqual(itemsBefore);
      expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(uploadsBefore);
      expect(yield* repo.findById(other)).toEqual(otherBefore);
    }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("renames one item by ID and touches only that item and its receipt", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const other = yield* repo.insert(receiptInput);
    const original = Option.getOrThrow(yield* repo.findById(receiptId));
    const otherBefore = yield* repo.findById(other);
    const otherTimes = yield* receiptTimes(other);
    const otherItemTimes = yield* itemTimes(other);
    const uploadsBefore = yield* sql`SELECT * FROM receipt_uploads`;
    const parentBefore = yield* receiptTimes(receiptId);
    const itemsBefore = yield* itemTimes(receiptId);

    const saved = yield* repo.updateItem(receiptId, original.items[1]!.id, { name: "Coupon" });
    const expected = {
      ...original,
      items: [original.items[0], { ...original.items[1]!, name: "Coupon" }],
    };
    expect(saved).toEqual(Option.some(expected));
    expect(yield* repo.findById(receiptId)).toEqual(saved);
    expect((yield* repo.list).find((entry) => entry.id === receiptId)).toEqual(expected);

    const parentAfter = yield* receiptTimes(receiptId);
    expect(parentAfter.created_at).toBe(parentBefore.created_at);
    expect(parentAfter.updated_at).not.toBe(parentBefore.updated_at);
    const itemsAfter = yield* itemTimes(receiptId);
    expect(itemsAfter[0]).toEqual(itemsBefore[0]);
    expect(itemsAfter[1]!.created_at).toBe(itemsBefore[1]!.created_at);
    expect(itemsAfter[1]!.updated_at).not.toBe(itemsBefore[1]!.updated_at);

    expect(yield* repo.findById(other)).toEqual(otherBefore);
    expect(yield* receiptTimes(other)).toEqual(otherTimes);
    expect(yield* itemTimes(other)).toEqual(otherItemTimes);
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(uploadsBefore);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("accepts same-value corrections and records them as updates", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const receiptId = yield* repo.insert(receiptInput);
    const original = Option.getOrThrow(yield* repo.findById(receiptId));
    const receiptBefore = yield* receiptTimes(receiptId);
    expect(
      yield* repo.update(receiptId, {
        storeName: original.storeName,
        receiptDate: original.receiptDate,
        category: original.category,
      }),
    ).toEqual(Option.some(original));
    const receiptAfter = yield* receiptTimes(receiptId);
    expect(receiptAfter.created_at).toBe(receiptBefore.created_at);
    expect(receiptAfter.updated_at).not.toBe(receiptBefore.updated_at);

    const itemsBefore = yield* itemTimes(receiptId);
    expect(
      yield* repo.updateItem(receiptId, original.items[0].id, { name: original.items[0].name }),
    ).toEqual(Option.some(original));
    const itemsAfter = yield* itemTimes(receiptId);
    expect(itemsAfter[0]!.updated_at).not.toBe(itemsBefore[0]!.updated_at);
    expect(itemsAfter[1]).toEqual(itemsBefore[1]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("returns none for missing receipts and item IDs without changing other receipts", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const single = yield* repo.insert({ ...receiptInput, items: [receiptInput.items[0]] });
    const double = yield* repo.insert(receiptInput);
    const [singleItem] = yield* itemIds(single);
    const [, otherItem] = yield* itemIds(double);
    const snapshot = Effect.all([
      repo.list,
      sql`SELECT * FROM receipts ORDER BY id`,
      sql`SELECT * FROM receipt_items ORDER BY receipt_id, position`,
    ]);
    const before = yield* snapshot;

    expect(yield* repo.update(ReceiptId.make("999"), { storeName: "Corner Store" })).toEqual(
      Option.none(),
    );
    expect(yield* repo.updateItem(ReceiptId.make("999"), singleItem!, { name: "Pears" })).toEqual(
      Option.none(),
    );
    // A real item ID under the wrong parent stays out of reach.
    expect(yield* repo.updateItem(single, otherItem!, { name: "Pears" })).toEqual(Option.none());
    expect(
      yield* repo.updateItem(single, ReceiptItemId.make("9223372036854775807"), { name: "Pears" }),
    ).toEqual(Option.none());
    expect(yield* snapshot).toEqual(before);
    expect(Option.getOrThrow(yield* repo.findById(double)).items[1]!.name).toBe("Adjustment");
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rolls back failed corrections, including their timestamps", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const [firstItem] = yield* itemIds(receiptId);
    yield* sql`ALTER TABLE receipts ADD CONSTRAINT reject_store CHECK (store_name <> 'Rejected')`;
    yield* sql`ALTER TABLE receipt_items ADD CONSTRAINT reject_item CHECK (name <> 'Rejected')`;
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts`,
      sql`SELECT * FROM receipt_items ORDER BY position`,
      sql`SELECT * FROM receipt_uploads`,
    ]);
    const before = yield* snapshot;

    for (const attempt of [
      repo.update(receiptId, { receiptDate: "2024-09-02", storeName: "Rejected" }),
      repo.updateItem(receiptId, firstItem!, { name: "Rejected" }),
    ]) {
      const result = yield* Effect.result(attempt);
      expect(Result.isFailure(result) && result.failure._tag).toBe(
        "GohoServer.ReceiptRepository.PersistenceError",
      );
      expect(yield* snapshot).toEqual(before);
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("joins the caller's transaction for corrections and rolls back with it", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* repo.insert(receiptInput);
    const [firstItem] = yield* itemIds(receiptId);
    const snapshot = Effect.all([sql`SELECT * FROM receipts`, sql`SELECT * FROM receipt_items`]);
    const before = yield* snapshot;
    const result = yield* sql
      .withTransaction(
        repo
          .update(receiptId, { storeName: "Corner Store" })
          .pipe(
            Effect.andThen(repo.updateItem(receiptId, firstItem!, { name: "Pears" })),
            Effect.andThen(new LaterStepFailed()),
          ),
      )
      .pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("GohoServer.Test.LaterStepFailed");
    expect(yield* snapshot).toEqual(before);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("waits for a concurrent receipt deletion and then reports the item as missing", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const receiptId = yield* insertScannedReceipt;
    const [firstItem] = yield* itemIds(receiptId);
    const [deleted, renamed] = yield* Effect.all(
      [repo.delete(receiptId), repo.updateItem(receiptId, firstItem!, { name: "Pears" })],
      { concurrency: 2 },
    );
    // Either order is coherent: a rename after deletion finds nothing; one before it is deleted.
    expect(Option.isSome(deleted)).toBe(true);
    expect(yield* repo.findById(receiptId)).toEqual(Option.none());
    if (Option.isSome(renamed)) expect(renamed.value.items[0]!.name).toBe("Pears");
  }).pipe(Effect.provide(DatabaseLive)),
);

const unusedUploads = Layer.succeed(ReceiptUploads.Service, {
  delete: () => Effect.die("Unexpected upload deletion"),
  list: Effect.die("Unexpected upload listing"),
  create: () => Effect.die("Unexpected upload creation"),
  get: () => Effect.die("Unexpected upload retrieval"),
  getImage: () => Effect.die("Unexpected image retrieval"),
});

const HttpDatabaseLive = HttpRouter.serve(
  Http.layer.pipe(
    Layer.provide([
      Receipts.layer.pipe(
        Layer.provide([
          Transaction.layer,
          Layer.succeed(FileStorage.Service, {
            put: () => Effect.die("Unexpected put"),
            get: () => Effect.die("Unexpected get"),
            delete: () => Effect.die("Unexpected delete"),
          }),
        ]),
      ),
      unusedUploads,
    ]),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(DatabaseLive));

it.effect("saves HTTP corrections that GET and list return, and rejects bad ones whole", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const other = yield* Repository.Service.pipe(
      Effect.flatMap((repo) => repo.insert(receiptInput)),
    );
    const client = yield* Client.make("");
    const { data: original } = yield* client.receipts.get({ params: { receiptId } });
    const [first, second] = original.items.map(({ id }) => id);
    const { data: otherBefore } = yield* client.receipts.get({ params: { receiptId: other } });
    const otherItem = otherBefore.items[0].id;
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts ORDER BY id`,
      sql`SELECT * FROM receipt_items ORDER BY receipt_id, position`,
      sql`SELECT * FROM receipt_uploads`,
    ]);
    const before = yield* snapshot;

    for (const [url, payload] of [
      [`/receipts/${receiptId}`, { storeName: "Corner Store", total: "1" }],
      [`/receipts/${receiptId}`, { receiptDate: "2024-02-30" }],
      [`/receipts/${receiptId}`, {}],
      [`/receipts/${receiptId}/items/${first}`, { name: "Pears", amount: "1" }],
      [`/receipts/${receiptId}/items/${first}`, { name: " " }],
      [`/receipts/${receiptId}/items/0${first}`, { name: "Pears" }],
      // Positions are not a fallback lookup.
      [`/receipts/${receiptId}/items/0`, { name: "Pears" }],
      [`/receipts/${receiptId}/items/9223372036854775808`, { name: "Pears" }],
    ] as const) {
      const response = yield* HttpClient.patch(url, { body: yield* HttpBody.json(payload) });
      expect(response.status, `${url} ${JSON.stringify(payload)}`).toBe(400);
    }
    for (const [url, payload] of [
      ["/receipts/999", { category: "Snacks" }],
      [`/receipts/999/items/${first}`, { name: "Pears" }],
      [`/receipts/${receiptId}/items/${otherItem}`, { name: "Pears" }],
      [`/receipts/${receiptId}/items/9223372036854775807`, { name: "Pears" }],
    ] as const) {
      const response = yield* HttpClient.patch(url, { body: yield* HttpBody.json(payload) });
      expect(response.status, url).toBe(404);
    }
    expect(yield* snapshot).toEqual(before);

    // The typed client encodes already-trimmed values, so wire trimming uses raw requests.
    const corrected = yield* HttpClient.patch(`/receipts/${receiptId}`, {
      body: yield* HttpBody.json({ storeName: "  Corner Store  ", receiptDate: "2024-09-02" }),
    });
    expect(corrected.status).toBe(200);
    expect(yield* corrected.json).toEqual({
      data: { ...original, storeName: "Corner Store", receiptDate: "2024-09-02" },
    });
    const trimmedItem = yield* HttpClient.patch(`/receipts/${receiptId}/items/${first}`, {
      body: yield* HttpBody.json({ name: " Pears " }),
    });
    expect(trimmedItem.status).toBe(200);
    const renamed = yield* client.receipts.patchItem({
      params: { receiptId, itemId: second! },
      payload: { name: "Coupon" },
    });
    expect(renamed.data).toEqual({
      ...original,
      storeName: "Corner Store",
      receiptDate: "2024-09-02",
      items: [
        { id: first, position: 0, name: "Pears", amount: "12.00" },
        { id: second, position: 1, name: "Coupon", amount: "-1.0" },
      ],
    });
    expect(yield* client.receipts.get({ params: { receiptId } })).toEqual(renamed);
    expect(yield* client.receipts.list()).toEqual({ data: [renamed.data, otherBefore] });
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(before[2]);
  }).pipe(Effect.provide(HttpDatabaseLive)),
);
