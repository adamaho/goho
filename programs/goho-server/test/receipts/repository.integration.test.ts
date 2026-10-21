import { NodeCrypto, NodeHttpServer, NodeServices } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import {
  CreateReceiptRequest,
  type PatchReceiptItemRequest,
  ReceiptId,
  ReceiptItemId,
} from "@goho/goho-api/receipts";
import * as Client from "@goho/goho-server-client/client";
import {
  Config,
  Context,
  Crypto,
  Effect,
  Layer,
  Option,
  Redacted,
  Ref,
  Result,
  Schema,
} from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as CategoryRepository from "#src/categories/repository.ts";
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
import receiptItemIdsMigration from "#src/database/migrations/0010-receipt-item-ids.ts";
import receiptHistoryMigration from "#src/database/migrations/0011-receipt-history.ts";
import receiptCategoriesMigration from "#src/database/migrations/0012-receipt-categories.ts";
import itemCategoriesMigration from "#src/database/migrations/0013-item-categories.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Worker from "#src/receipt-uploads/worker.ts";
import * as Repository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";

import { generateObject, parsedReceipt, receipt } from "./fixtures.ts";

const receiptInput = CreateReceiptRequest.make({
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  subtotal: "10.250",
  tax: "7.5e-1",
  total: "11.00",
  currency: "CAD",
  items: [
    { name: "Apples", amount: "12.00", category: "Groceries" },
    { name: "Adjustment", amount: "-1.0", category: "Groceries" },
  ],
});

// The sample receipt with every item in the named category.
const withCategory = (category: string): CreateReceiptRequest => {
  const [first, ...rest] = receiptInput.items;
  return {
    ...receiptInput,
    items: [{ ...first, category }, ...rest.map((item) => ({ ...item, category }))],
  };
};

// Seeded catalog, alphabetically.
const seededNames = [
  "charity",
  "dining",
  "gas",
  "groceries",
  "health",
  "household",
  "personal care",
  "shopping",
];

const categoryNamed = (name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [category] = yield* sql`
      SELECT id::text, name, icon, color, to_jsonb(kinds) AS kinds FROM categories
      WHERE name = ${name}
    `;
    return category;
  });

// Every category column for unchanged-state snapshots. The driver has no binary
// codec for the enum array, so kinds come back as text.
const catalogRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`
    SELECT id, name, icon, color, kinds::text AS kinds, created_at, updated_at
    FROM categories ORDER BY id
  `;
});

const RepositoriesLive = Repository.layer.pipe(Layer.provideMerge(CategoryRepository.layer));

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
      RepositoriesLive.pipe(
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
    {
      conname: "receipt_items_category_id_fkey",
      definition: "FOREIGN KEY (category_id) REFERENCES categories(id)",
    },
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

const migrationsThroughReceiptCategories = {
  "0001_receipts": receiptsMigration,
  "0002_create_receipt": createReceiptMigration,
  "0003_bigint_receipt_ids": bigintReceiptIdsMigration,
  "0004_receipt_uploads": receiptUploadsMigration,
  "0005_receipt_upload_file_id": receiptUploadFileIdMigration,
  "0006_drop_receipt_idempotency": dropReceiptIdempotencyMigration,
  "0007_move_extraction_to_uploads": moveExtractionToUploadsMigration,
  "0008_default_receipt_currency": defaultReceiptCurrencyMigration,
  "0009_record_timestamps": recordTimestampsMigration,
  "0010_receipt_item_ids": receiptItemIdsMigration,
  "0011_receipt_history": receiptHistoryMigration,
  "0012_receipt_categories": receiptCategoriesMigration,
};

// Combines receipt and item history in edit order and numbers random operation IDs by
// first appearance so expectations can show grouping. Rows from one statement share
// edited_at, so receipt, item and field make order stable.
const history = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{
    operation_id: string;
    receipt_id: string;
    item_id: string | null;
    field: string;
    before_value: string;
    after_value: string;
  }>`
    SELECT operation_id::text, receipt_id::text, item_id::text, field, before_value, after_value
    FROM (
      SELECT operation_id, receipt_id, NULL::bigint AS item_id, field, before_value, after_value,
        edited_at
      FROM receipt_history
      UNION ALL
      SELECT operation_id, receipt_id, item_id, field, before_value, after_value, edited_at
      FROM receipt_item_history
    ) history
    ORDER BY history.edited_at, history.receipt_id, history.item_id NULLS FIRST, history.field
  `;
  const operations: Array<string> = [];
  return rows.map(({ operation_id, ...edit }) => {
    if (!operations.includes(operation_id)) operations.push(operation_id);
    return { operation: operations.indexOf(operation_id) + 1, ...edit };
  });
});

// Receipt rows for upgrade snapshots; migration 0012 replaces the category column.
const receiptRowsWithoutCategory = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`
    SELECT id, store_name, receipt_date, subtotal, tax, total, currency, created_at, updated_at
    FROM receipts ORDER BY id
  `;
});

// Item rows for upgrade snapshots; migration 0013 adds the category column.
const itemRowsWithoutCategory = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`
    SELECT id, receipt_id, position, name, amount, created_at, updated_at
    FROM receipt_items ORDER BY id
  `;
});

// Raw rows from both history tables, for unchanged-state snapshots.
const historyRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* Effect.all([
    sql`SELECT * FROM receipt_history ORDER BY id`,
    sql`SELECT * FROM receipt_item_history ORDER BY id`,
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
      { name: "receipt_history" },
      { name: "receipt_categories" },
      { name: "item_categories" },
      { name: "category_kinds" },
      { name: "books" },
      { name: "book_uploads" },
    ]);
    // The canonical catalog is seeded with its display metadata.
    expect(yield* sql`SELECT name, icon, color FROM categories ORDER BY id`).toEqual([
      { name: "groceries", icon: "groceries", color: "green" },
      { name: "dining", icon: "meals", color: "orange" },
      { name: "shopping", icon: "shopping", color: "purple" },
      { name: "household", icon: "home", color: "brown" },
      { name: "personal care", icon: "personal_care", color: "pink" },
      { name: "health", icon: "health", color: "red" },
      { name: "gas", icon: "transport", color: "blue" },
      { name: "charity", icon: "other", color: "grey" },
      { name: "fiction", icon: "other", color: "grey" },
      { name: "nonfiction", icon: "other", color: "grey" },
    ]);
    // New names get the generic metadata.
    expect(
      yield* sql`INSERT INTO categories (name) VALUES ('snacks') RETURNING icon, color`,
    ).toEqual([{ icon: "other", color: "grey" }]);
    // Any icon identifier is stored as given.
    expect(
      yield* sql`INSERT INTO categories (name, icon) VALUES ('candy', 'lollipop') RETURNING icon`,
    ).toEqual([{ icon: "lollipop" }]);
    // Category names are unique, nonempty, trimmed and lowercase, icons are required,
    // colours use known keys, and each item keeps one category.
    yield* sql`
      INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total)
      VALUES ('Example Store', '2026-10-01', 1, 0, 1)
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, category_id)
      SELECT receipts.id, 0, 'Apples', 1, categories.id
      FROM receipts, categories WHERE categories.name = 'groceries'
    `;
    for (const statement of [
      sql`INSERT INTO categories (name) VALUES ('groceries')`,
      sql`INSERT INTO categories (name) VALUES ('Chips')`,
      sql`INSERT INTO categories (name) VALUES (' ')`,
      sql`INSERT INTO categories (name) VALUES ('chips ')`,
      sql`INSERT INTO categories (name, color) VALUES ('chips', 'Grey')`,
      sql`INSERT INTO categories (name, icon) VALUES ('chips', NULL)`,
      sql`
        INSERT INTO receipt_items (receipt_id, position, name, amount)
        SELECT id, 1, 'Pears', 1 FROM receipts
      `,
      sql`
        INSERT INTO receipt_items (receipt_id, position, name, amount, category_id)
        SELECT id, 1, 'Pears', 1, 9999 FROM receipts
      `,
      sql`UPDATE receipt_items SET category_id = NULL`,
      sql`DELETE FROM categories WHERE name = 'groceries'`,
    ]) {
      expect(Result.isFailure(yield* Effect.result(statement))).toBe(true);
    }
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 1 }]);
    expect(
      yield* sql`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'receipt_items_category_id_idx'
      `,
    ).toEqual([
      { indexdef: expect.stringMatching(/\.receipt_items USING btree \(category_id\)$/) },
    ]);
    // Both history tables require their references and are removed with them.
    expect(
      yield* sql`
        SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid IN ('receipt_history'::regclass, 'receipt_item_history'::regclass)
        ORDER BY table_name, definition
      `,
    ).toEqual([
      {
        table_name: "receipt_history",
        definition: "FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE",
      },
      {
        table_name: "receipt_item_history",
        definition: "FOREIGN KEY (item_id) REFERENCES receipt_items(id) ON DELETE CASCADE",
      },
      {
        table_name: "receipt_item_history",
        definition: "FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE",
      },
    ]);
    expect(
      yield* sql`
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('receipt_history', 'receipt_item_history')
          AND column_name IN ('receipt_id', 'item_id')
        ORDER BY table_name, column_name
      `,
    ).toEqual([
      { table_name: "receipt_history", column_name: "receipt_id", is_nullable: "NO" },
      { table_name: "receipt_item_history", column_name: "item_id", is_nullable: "NO" },
      { table_name: "receipt_item_history", column_name: "receipt_id", is_nullable: "NO" },
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
        INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total, currency)
        VALUES ('New Store', '2026-09-02', 20, 2, 22, 'CAD')
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
      INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total)
      VALUES ('Default Store', '2026-09-03', 5, 1, 6)
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

it.effect("finds one receipt with its distinct item categories and none for a missing ID", () =>
  Effect.gen(function* () {
    // Records each category lookup the receipt repository makes.
    const categories = yield* CategoryRepository.Service;
    const lookups = yield* Ref.make<ReadonlyArray<string>>([]);
    const repo = yield* Repository.Service.pipe(
      Effect.provide(
        Repository.layer.pipe(
          Layer.provide(
            Layer.succeed(CategoryRepository.Service, {
              ...categories,
              findOrCreate: (name, kind) =>
                Ref.update(lookups, (names) => [...names, name]).pipe(
                  Effect.andThen(categories.findOrCreate(name, kind)),
                ),
            }),
          ),
        ),
      ),
    );
    const receiptId = yield* repo.insert({
      ...receiptInput,
      items: [
        { name: "Milk", amount: "4.00", category: "Groceries" },
        { name: "Shirt", amount: "8.00", category: "shopping" },
        { name: "Apples", amount: "0.25", category: " groceries " },
        { name: "Bread", amount: "3.00", category: "Groceries" },
        { name: "Socks", amount: "5.00", category: "shopping" },
      ],
    });
    // Repeated names are looked up once; a spelling variant still resolves in SQL.
    expect(yield* Ref.get(lookups)).toEqual(["Groceries", "shopping", " groceries "]);
    const [milk, shirt, apples, bread, socks] = yield* itemIds(receiptId);
    expect(new Set([milk, shirt, apples, bread, socks]).size).toBe(5);
    const groceries = yield* categoryNamed("groceries");
    const shopping = yield* categoryNamed("shopping");
    const saved = yield* repo.findById(receiptId);
    expect(saved).toEqual(
      Option.some({
        id: receiptId,
        storeName: "Example Store",
        receiptDate: "2024-09-01",
        subtotal: "10.250",
        tax: "0.75",
        total: "11.00",
        currency: "CAD",
        categories: [groceries, shopping],
        items: [
          { id: milk, position: 0, name: "Milk", amount: "4.00", category: groceries },
          { id: shirt, position: 1, name: "Shirt", amount: "8.00", category: shopping },
          { id: apples, position: 2, name: "Apples", amount: "0.25", category: groceries },
          { id: bread, position: 3, name: "Bread", amount: "3.00", category: groceries },
          { id: socks, position: 4, name: "Socks", amount: "5.00", category: shopping },
        ],
      }),
    );
    // Receipts have no category of their own.
    expect(Object.keys(Option.getOrThrow(saved))).not.toContain("category");
    expect((yield* repo.list)[0]).toEqual(Option.getOrThrow(saved));
    expect(yield* repo.findById(ReceiptId.make("999"))).toEqual(Option.none());

    // The next receipt looks its categories up again.
    const next = yield* repo.insert(withCategory("Groceries"));
    expect(yield* Ref.get(lookups)).toEqual(["Groceries", "shopping", " groceries ", "Groceries"]);
    expect(
      Option.getOrThrow(yield* repo.findById(next)).items.map(({ category }) => category),
    ).toEqual([groceries, groceries]);
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
        SELECT store_name, receipt_date::text, subtotal, tax, total, currency
        FROM receipts WHERE id = ${receiptId}
      `,
    ).toEqual([
      {
        store_name: "Example Store",
        receipt_date: "2026-09-01",
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        currency: "CAD",
      },
    ]);
    expect(
      yield* sql`
        SELECT i.position, i.name, i.amount, c.name AS category
        FROM receipt_items i JOIN categories c ON c.id = i.category_id
        WHERE i.receipt_id = ${receiptId} ORDER BY i.position
      `,
    ).toEqual([
      { position: 0, name: "Apples", amount: "0.3333333333333333", category: "groceries" },
      { position: 1, name: "Apples", amount: "0.3333333333333333", category: "groceries" },
      { position: 2, name: "Adjustment", amount: "-1", category: "groceries" },
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
    const catalog = yield* catalogRows;
    const result = yield* repo.insert(withCategory("Snacks")).pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe(
      "GohoServer.ReceiptRepository.PersistenceError",
    );
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
    expect(yield* catalogRows).toEqual(catalog);
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
    const catalog = yield* catalogRows;
    const result = yield* sql
      .withTransaction(
        repo.insert(withCategory("Snacks")).pipe(Effect.andThen(new LaterStepFailed())),
      )
      .pipe(Effect.result);
    expect(Result.isFailure(result) && result.failure._tag).toBe("GohoServer.Test.LaterStepFailed");
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 0 }]);
    expect(yield* sql`SELECT count(*)::int AS count FROM receipt_items`).toEqual([{ count: 0 }]);
    expect(yield* catalogRows).toEqual(catalog);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("reuses one lowercase category per name and keeps categories without items", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const categories = yield* CategoryRepository.Service;
    const catalog = catalogRows;
    expect(yield* categories.listNamesForCategory("receipt")).toEqual(seededNames);
    const seeded = yield* catalog;
    const first = yield* repo.insert(receiptInput);
    yield* repo.insert(withCategory("GROCERIES"));
    // Reuse is a lookup: the category row, including its timestamps, stays as seeded.
    expect(yield* catalog).toEqual(seeded);
    // Finding returns the stored record with its canonical name and metadata.
    expect(yield* categories.findOrCreate("  GroCeries ", "receipt")).toEqual(
      yield* categoryNamed("groceries"),
    );

    // Distinct words stay separate; concurrent saves of one new name share a category.
    yield* Effect.all(
      ["Snacks", "snacks", "Grocery"].map((category) => repo.insert(withCategory(category))),
      { concurrency: "unbounded" },
    );
    expect(yield* categories.listNamesForCategory("receipt")).toEqual(
      [...seededNames, "grocery", "snacks"].sort(),
    );
    expect(
      (yield* repo.list).flatMap(({ categories }) => categories.map(({ name }) => name)).sort(),
    ).toEqual(["groceries", "groceries", "grocery", "snacks", "snacks"]);

    // Creating returns the same record shape, trimmed and lowercased with generic metadata.
    const petFood = yield* categories.findOrCreate(" Pet Food ", "receipt");
    expect(petFood).toEqual({
      id: expect.any(String),
      name: "pet food",
      icon: "other",
      color: "grey",
      kinds: ["receipt"],
    });
    expect(yield* categoryNamed("pet food")).toEqual(petFood);
    const [apples] = yield* itemIds(first);
    yield* repo.updateItem(first, apples!, { category: "Pet food" });
    for (const { id } of yield* repo.list) yield* repo.delete(id);
    expect(yield* categories.findOrCreate("pet food", "receipt")).toEqual(petFood);
    expect(yield* categories.listNamesForCategory("receipt")).toEqual(
      [...seededNames, "grocery", "pet food", "snacks"].sort(),
    );
    expect((yield* catalog).slice(0, seeded.length)).toEqual(seeded);
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
    const [firstItem] = yield* itemIds(receiptId);
    yield* repo.update(receiptId, { storeName: "Corner Store" });
    yield* repo.updateItem(receiptId, firstItem!, { name: "Pears", category: "Snacks" });
    const before = yield* repo.findById(receiptId);
    const uploadsBefore = yield* sql`SELECT * FROM receipt_uploads`;
    const historyBefore = yield* historyRows;
    expect(historyBefore.map((rows) => rows.length)).toEqual([1, 2]);
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
    expect(yield* historyRows).toEqual(historyBefore);
    failCleanup = false;
    yield* service.delete(receiptId);
    expect(yield* repo.findById(receiptId)).toEqual(Option.none());
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual([]);
    expect(yield* sql`SELECT * FROM receipt_items`).toEqual([]);
    expect(yield* historyRows).toEqual([[], []]);
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
        AND table_name IN ('categories', 'receipts', 'receipt_items', 'receipt_uploads')
        AND column_name IN ('created_at', 'updated_at')
      ORDER BY table_name, column_name
    `,
    ).toEqual(
      ["categories", "receipt_items", "receipt_uploads", "receipts"].flatMap((table_name) =>
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
      receiptRowsWithoutCategory,
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

    const repo = yield* Effect.provide(Repository.Service, RepositoriesLive);
    const migrated = Option.getOrThrow(yield* repo.findById(ReceiptId.make("1")));
    expect(migrated.items.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: ids[0], position: 0 },
      { id: ids[1], position: 1 },
    ]);
    const renamed = Option.getOrThrow(
      yield* repo.updateItem(ReceiptId.make("1"), ids[1]!, { name: "Pears" }),
    );
    expect(renamed).toEqual({ ...migrated.items[1], name: "Pears" });
    const reread = Option.getOrThrow(yield* repo.findById(ReceiptId.make("1")));
    expect(reread.items.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: ids[0], name: "Apples" },
      { id: ids[1], name: "Pears" },
    ]);

    const insertItem = (position: number, name: string) => sql<{ id: string }>`
      INSERT INTO receipt_items (receipt_id, position, name, amount, category_id)
      SELECT 2, ${position}, ${name}, 1, id FROM categories WHERE name = 'groceries'
      RETURNING id::text
    `;
    const [inserted] = yield* insertItem(1, "Pears");
    expect(ids.every((id) => BigInt(inserted!.id) > BigInt(id))).toBe(true);
    const duplicate = yield* insertItem(0, "Again").pipe(Effect.result);
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
    const groceries = yield* categoryNamed("groceries");
    yield* repo.updateItem(receiptId, apples!, { name: "Pears" });
    expect(yield* itemIds(receiptId)).toEqual([apples, adjustment]);

    // No endpoint reorders items; swap positions directly through a free slot.
    yield* sql`UPDATE receipt_items SET position = 2 WHERE id = ${apples!}`;
    yield* sql`UPDATE receipt_items SET position = 0 WHERE id = ${adjustment!}`;
    yield* sql`UPDATE receipt_items SET position = 1 WHERE id = ${apples!}`;
    const renamed = yield* repo.updateItem(receiptId, apples!, { name: "Granny Smith apples" });
    // The returned item reports its current position, not the one it was created in.
    expect(renamed).toEqual(
      Option.some({
        id: apples,
        position: 1,
        name: "Granny Smith apples",
        amount: "12.00",
        category: groceries,
      }),
    );
    expect(Option.getOrThrow(yield* repo.findById(receiptId)).items).toEqual([
      { id: adjustment, position: 0, name: "Adjustment", amount: "-1.0", category: groceries },
      Option.getOrThrow(renamed),
    ]);
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
).pipe(Layer.provideMerge(DatabaseLive));

it.effect("processes uploads into current catalog categories and keeps their evidence", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const uploads = yield* ReceiptUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const prompts = yield* Ref.make<ReadonlyArray<string>>([]);
    const extracted = (categories: ReadonlyArray<string>) => ({
      ...parsedReceipt,
      transaction: {
        ...parsedReceipt.transaction,
        items: parsedReceipt.transaction.items.map((item, index) => ({
          ...item,
          category: categories[index],
        })),
      },
    });
    const processUpload = (uploadId: ReceiptUploadId, output: unknown) =>
      Effect.gen(function* () {
        yield* uploads.createQueued({
          id: uploadId,
          fileId: FileStorage.FileId.make(`photo-${uploadId}`),
          fileName: "receipt.png",
          contentType: "image/png",
        });
        yield* Worker.process({ uploadId }, { id: uploadId, attempts: 3 }).pipe(
          Effect.provideService(Ai.Service, {
            generateObject: (options) =>
              Ref.update(prompts, (values) => [...values, JSON.stringify(options.prompt)]).pipe(
                Effect.andThen(generateObject(output)(options)),
              ),
          }),
          Effect.ignore,
        );
        return Option.getOrThrow(yield* uploads.findById(uploadId));
      });
    const mixed = extracted(["groceries", "groceries", "shopping"]);
    const uploadId = ReceiptUploadId.make("7d89d8f7-6f0c-4df2-a2a9-94771638ac99");
    const upload = yield* processUpload(uploadId, mixed);
    expect(upload.status).toBe("succeeded");
    const receiptId = Option.getOrThrow(Option.fromNullishOr(upload.receiptId));
    const saved = Option.getOrThrow(yield* repo.findById(receiptId));
    const [groceries, shopping] = [
      yield* categoryNamed("groceries"),
      yield* categoryNamed("shopping"),
    ];
    expect(saved.categories).toEqual([groceries, shopping]);
    const ids = yield* itemIds(receiptId);
    expect(new Set(ids).size).toBe(3);
    expect(
      saved.items.map(({ id, position, name, category }) => ({ id, position, name, category })),
    ).toEqual([
      { id: ids[0], position: 0, name: "Apples", category: groceries },
      { id: ids[1], position: 1, name: "Apples", category: groceries },
      { id: ids[2], position: 2, name: "Adjustment", category: shopping },
    ]);

    // A manually added category is offered to, and accepted from, the next extraction.
    yield* repo.updateItem(receiptId, ids[2]!, { category: "Snacks" });
    const later = yield* processUpload(
      ReceiptUploadId.make("8e0ae9f8-7a1d-4ef3-b3ba-a5882749bd00"),
      extracted(["snacks", "snacks", "snacks"]),
    );
    expect(later.status).toBe("succeeded");
    const laterReceipt = Option.getOrThrow(
      yield* repo.findById(Option.getOrThrow(Option.fromNullishOr(later.receiptId))),
    );
    expect(laterReceipt.categories).toEqual([yield* categoryNamed("snacks")]);
    expect((yield* Ref.get(prompts))[1]).toContain(
      JSON.stringify(
        `Allowed item categories, as a JSON array: ${JSON.stringify([...seededNames, "snacks"].sort())}`,
      ),
    );

    // A category outside the catalog fails the upload and creates nothing.
    const before = yield* Effect.all([
      catalogRows,
      sql`SELECT count(*)::int AS count FROM receipts`,
    ]);
    const invalid = yield* processUpload(
      ReceiptUploadId.make("9f1bf009-8b2e-4f04-84cb-b6993859ce11"),
      extracted(["groceries", "candy", "groceries"]),
    );
    expect([invalid.status, invalid.failureCode]).toEqual(["failed", "processing_failed"]);
    expect(
      yield* Effect.all([catalogRows, sql`SELECT count(*)::int AS count FROM receipts`]),
    ).toEqual(before);

    const extraction = sql`
      SELECT extraction_version, extracted_payload FROM receipt_uploads WHERE id = ${uploadId}
    `;
    const evidence = yield* extraction;
    // The original extraction keeps the categories as the model returned them.
    expect(evidence).toEqual([{ extraction_version: 2, extracted_payload: mixed }]);
    yield* repo.updateItem(receiptId, ids[0]!, { name: "Granny Smith apples" });
    yield* repo.update(receiptId, { storeName: "Corner Store" });
    expect(yield* extraction).toEqual(evidence);
    expect((yield* history).map(({ field, after_value }) => ({ field, after_value }))).toEqual([
      { field: "category", after_value: "snacks" },
      { field: "item_name", after_value: "Granny Smith apples" },
      { field: "store_name", after_value: "Corner Store" },
    ]);
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
          // Leaves only a category created in this transaction.
          yield* sql`DELETE FROM categories`;
          yield* sql`INSERT INTO categories (name) VALUES ('groceries')`;
          yield* sql`
        INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total)
        VALUES ('Example Store', '2011-10-26', 10, 1, 11)
      `;
          yield* sql`
        INSERT INTO receipt_items (receipt_id, position, name, amount, category_id)
        SELECT receipts.id, 0, 'Apples', 11, categories.id FROM receipts, categories
      `;
          yield* sql`
        INSERT INTO receipt_uploads (id, file_id, file_name, content_type, status)
        VALUES ('00000000-0000-4000-8000-000000000001', 'photo', 'receipt.png', 'image/png', 'queued')
      `;
          for (const table of ["categories", "receipts", "receipt_items", "receipt_uploads"]) {
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
      INSERT INTO receipts (store_name, receipt_date, subtotal, tax, total)
      VALUES
        ('First Store', '2026-10-11', 10, 1, 11),
        ('Second Store', '2026-10-11', 10, 1, 11),
        ('Unrelated Store', '2026-10-11', 10, 1, 11)
    `;
    const insertApples = sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, category_id)
      SELECT 1, 0, 'Apples', 11, id FROM categories WHERE name = 'groceries'
    `;
    const snapshot = sql<{ id: number; created_at: string; updated_at: string }>`
      SELECT id::int, created_at::text, updated_at::text FROM receipts ORDER BY id
    `;
    const changes = [
      { affected: [1], run: insertApples },
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

    yield* insertApples;
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
        { storeName: "Corner Store", receiptDate: "2024-09-03" },
        { storeName: "Main Street Market" },
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
        receiptDate: "2024-09-03",
      });
      expect(yield* itemTimes(receiptId)).toEqual(itemsBefore);
      expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(uploadsBefore);
      expect(yield* repo.findById(other)).toEqual(otherBefore);
    }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("corrects one item by ID and touches only that item and its receipt", () =>
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
    const [first, second] = original.items;
    const correct = (changes: PatchReceiptItemRequest) =>
      repo.updateItem(receiptId, second!.id, changes).pipe(Effect.map(Option.getOrThrow));

    // Each correction returns the saved item, and the receipt's categories follow its items.
    const coupon = yield* correct({ name: "Coupon" });
    expect(coupon).toEqual({ ...second, name: "Coupon" });
    const snacks = yield* correct({ category: " Snacks " });
    expect(snacks).toEqual({ ...coupon, category: yield* categoryNamed("snacks") });
    expect(Option.getOrThrow(yield* repo.findById(receiptId)).categories).toEqual([
      first.category,
      snacks.category,
    ]);
    const chips = yield* correct({ name: "Chips", category: "Household" });
    expect(chips).toEqual({
      ...second,
      name: "Chips",
      category: yield* categoryNamed("household"),
    });
    const expected = {
      ...original,
      categories: [first.category, chips.category],
      items: [first, chips],
    };
    expect(yield* repo.findById(receiptId)).toEqual(Option.some(expected));
    expect((yield* repo.list).find((entry) => entry.id === receiptId)).toEqual(expected);
    // Moving the last item out of a category drops it from the receipt; the category stays.
    yield* repo.updateItem(receiptId, first.id, { category: "household" });
    expect(Option.getOrThrow(yield* repo.findById(receiptId)).categories).toEqual([chips.category]);
    expect(yield* categoryNamed("groceries")).toEqual(first.category);

    const parentAfter = yield* receiptTimes(receiptId);
    expect(parentAfter.created_at).toBe(parentBefore.created_at);
    expect(parentAfter.updated_at).not.toBe(parentBefore.updated_at);
    const itemsAfter = yield* itemTimes(receiptId);
    for (const index of [0, 1]) {
      expect(itemsAfter[index]!.created_at).toBe(itemsBefore[index]!.created_at);
      expect(itemsAfter[index]!.updated_at).not.toBe(itemsBefore[index]!.updated_at);
    }

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
      }),
    ).toEqual(Option.some(original));
    const receiptAfter = yield* receiptTimes(receiptId);
    expect(receiptAfter.created_at).toBe(receiptBefore.created_at);
    expect(receiptAfter.updated_at).not.toBe(receiptBefore.updated_at);

    const itemsBefore = yield* itemTimes(receiptId);
    // A case-only category change resolves to the same category.
    expect(
      yield* repo.updateItem(receiptId, original.items[0].id, {
        name: original.items[0].name,
        category: original.items[0].category.name.toUpperCase(),
      }),
    ).toEqual(Option.some(original.items[0]));
    expect(yield* repo.findById(receiptId)).toEqual(Option.some(original));
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
      catalogRows,
    ]);
    const before = yield* snapshot;

    expect(yield* repo.update(ReceiptId.make("999"), { storeName: "Corner Store" })).toEqual(
      Option.none(),
    );
    // A missing receipt or item does not leave its new category behind.
    const changes = { name: "Pears", category: "Snacks" };
    expect(yield* repo.updateItem(ReceiptId.make("999"), singleItem!, changes)).toEqual(
      Option.none(),
    );
    // A real item ID under the wrong parent stays out of reach.
    expect(yield* repo.updateItem(single, otherItem!, changes)).toEqual(Option.none());
    expect(
      yield* repo.updateItem(single, ReceiptItemId.make("9223372036854775807"), changes),
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
      catalogRows,
      historyRows,
    ]);
    const before = yield* snapshot;

    for (const attempt of [
      Effect.asVoid(repo.update(receiptId, { receiptDate: "2024-09-02", storeName: "Rejected" })),
      Effect.asVoid(
        repo.updateItem(receiptId, firstItem!, { name: "Rejected", category: "Snacks" }),
      ),
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
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts`,
      sql`SELECT * FROM receipt_items`,
      catalogRows,
      historyRows,
    ]);
    const before = yield* snapshot;
    const result = yield* sql
      .withTransaction(
        repo
          .update(receiptId, { storeName: "Corner Store" })
          .pipe(
            Effect.andThen(
              repo.updateItem(receiptId, firstItem!, { name: "Pears", category: "Snacks" }),
            ),
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
    if (Option.isSome(renamed))
      expect(renamed.value).toMatchObject({ id: firstItem, name: "Pears" });
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
      Layer.mock(Books.Service, {}),
      Layer.mock(BookUploads.Service, {}),
    ]),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(DatabaseLive));

it.effect("saves HTTP corrections that GET and list return, and rejects bad ones whole", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const client = yield* Client.make("");
    const { data: original } = yield* client.receipts.get({ params: { receiptId } });
    const [first, second] = original.items.map(({ id }) => id);
    // Created, fetched, and listed receipts all return the shared lowercase categories.
    const { data: otherBefore } = yield* client.receipts.create({
      payload: withCategory("Household"),
    });
    expect([original.categories, otherBefore.categories]).toEqual([
      [yield* categoryNamed("groceries")],
      [yield* categoryNamed("household")],
    ]);
    const otherItem = otherBefore.items[0].id;
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts ORDER BY id`,
      sql`SELECT * FROM receipt_items ORDER BY receipt_id, position`,
      sql`SELECT * FROM receipt_uploads`,
      catalogRows,
      historyRows,
    ]);
    const before = yield* snapshot;

    for (const [url, payload] of [
      [`/receipts/${receiptId}`, { storeName: "Corner Store", total: "1" }],
      [`/receipts/${receiptId}`, { receiptDate: "2024-02-30" }],
      [`/receipts/${receiptId}`, {}],
      // Receipts no longer have a category of their own.
      [`/receipts/${receiptId}`, { storeName: "Corner Store", category: "Snacks" }],
      [`/receipts/${receiptId}/items/${first}`, { name: "Pears", amount: "1" }],
      [`/receipts/${receiptId}/items/${first}`, { name: " " }],
      [`/receipts/${receiptId}/items/${first}`, {}],
      [`/receipts/${receiptId}/items/${first}`, { name: "Pears", category: " " }],
      [`/receipts/${receiptId}/items/0${first}`, { name: "Pears" }],
      // Positions are not a fallback lookup.
      [`/receipts/${receiptId}/items/0`, { name: "Pears" }],
      [`/receipts/${receiptId}/items/9223372036854775808`, { name: "Pears" }],
    ] as const) {
      const response = yield* HttpClient.patch(url, { body: yield* HttpBody.json(payload) });
      expect(response.status, `${url} ${JSON.stringify(payload)}`).toBe(400);
    }
    for (const [url, payload] of [
      ["/receipts/999", { storeName: "Corner Store" }],
      [`/receipts/999/items/${first}`, { name: "Pears", category: "Snacks" }],
      [`/receipts/${receiptId}/items/${otherItem}`, { category: "Snacks" }],
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
      body: yield* HttpBody.json({ name: " Pears ", category: " Snacks " }),
    });
    expect(trimmedItem.status).toBe(200);
    const snacks = yield* categoryNamed("snacks");
    expect(snacks).toEqual({
      id: expect.any(String),
      name: "snacks",
      icon: "other",
      color: "grey",
      kinds: ["receipt"],
    });
    // Exactly the saved item comes back, with no receipt fields alongside it.
    expect(yield* trimmedItem.json).toStrictEqual({
      data: { id: first, position: 0, name: "Pears", amount: "12.00", category: snacks },
    });
    const groceries = original.categories[0];
    const renamed = yield* client.receipts.patchItem({
      params: { receiptId, itemId: second! },
      payload: { name: "Coupon" },
    });
    expect(renamed).toEqual({
      data: { id: second, position: 1, name: "Coupon", amount: "-1.0", category: groceries },
    });
    const saved = {
      ...original,
      storeName: "Corner Store",
      receiptDate: "2024-09-02",
      categories: [snacks, groceries],
      items: [
        { id: first, position: 0, name: "Pears", amount: "12.00", category: snacks },
        { id: second, position: 1, name: "Coupon", amount: "-1.0", category: groceries },
      ],
    };
    expect(yield* client.receipts.get({ params: { receiptId } })).toEqual({ data: saved });
    expect(yield* client.receipts.list()).toEqual({ data: [saved, otherBefore] });
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(before[2]);
    // An icon outside the app's bundled set comes back as stored.
    yield* sql`UPDATE categories SET icon = 'mdi:popcorn' WHERE name = 'snacks'`;
    const popcorn = { ...snacks, icon: "mdi:popcorn" };
    const { data: reread } = yield* client.receipts.get({ params: { receiptId } });
    expect([reread.categories[0], reread.items[0].category]).toEqual([popcorn, popcorn]);
    // History stores the trimmed values against the patched receipt and items.
    expect(yield* history).toEqual([
      {
        operation: 1,
        receipt_id: receiptId,
        item_id: null,
        field: "receipt_date",
        before_value: "2024-09-01",
        after_value: "2024-09-02",
      },
      {
        operation: 1,
        receipt_id: receiptId,
        item_id: null,
        field: "store_name",
        before_value: "Example Store",
        after_value: "Corner Store",
      },
      {
        operation: 2,
        receipt_id: receiptId,
        item_id: first,
        field: "category",
        before_value: "groceries",
        after_value: "snacks",
      },
      {
        operation: 2,
        receipt_id: receiptId,
        item_id: first,
        field: "item_name",
        before_value: "Apples",
        after_value: "Pears",
      },
      {
        operation: 3,
        receipt_id: receiptId,
        item_id: second,
        field: "item_name",
        before_value: "Adjustment",
        after_value: "Coupon",
      },
    ]);
  }).pipe(Effect.provide(HttpDatabaseLive)),
);

it.effect("adds edit history to populated databases without baselines or changed data", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO receipts (
        store_name, receipt_date, category, subtotal, tax, total, created_at, updated_at
      ) VALUES
        ('First Store', '2026-10-01', 'Groceries', 11, 0, 11, '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z'),
        ('Second Store', '2026-10-03', 'Groceries', 5, 0, 5, '2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z')
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, created_at, updated_at)
      VALUES
        (1, 0, 'Apples', 10.670, '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
        (1, 1, 'Apples', 0.33, '2026-10-01T12:00:00Z', '2026-10-01T12:00:00Z'),
        (2, 0, 'Pears', 5, '2026-10-03T12:00:00Z', '2026-10-03T12:00:00Z')
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
      receiptRowsWithoutCategory,
      itemRowsWithoutCategory,
      sql`SELECT * FROM receipt_uploads`,
    ]);
    const before = yield* snapshot;

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    expect(yield* sql`SELECT name FROM goho_migrations WHERE migration_id > 10`).toEqual([
      { name: "receipt_history" },
      { name: "receipt_categories" },
      { name: "item_categories" },
      { name: "category_kinds" },
      { name: "books" },
      { name: "book_uploads" },
    ]);
    expect(yield* snapshot).toEqual(before);
    expect(yield* history).toEqual([]);

    const repo = yield* Effect.provide(Repository.Service, RepositoriesLive);
    const [apples] = yield* itemIds(ReceiptId.make("1"));
    yield* repo.update(ReceiptId.make("1"), { storeName: "Corner Store" });
    yield* repo.updateItem(ReceiptId.make("1"), apples!, { name: "Granny Smith apples" });
    expect(yield* history).toEqual([
      {
        operation: 1,
        receipt_id: "1",
        item_id: null,
        field: "store_name",
        before_value: "First Store",
        after_value: "Corner Store",
      },
      {
        operation: 2,
        receipt_id: "1",
        item_id: apples,
        field: "item_name",
        before_value: "Apples",
        after_value: "Granny Smith apples",
      },
    ]);
    const [receiptsAfter, itemsAfter, uploadsAfter] = yield* snapshot;
    expect(receiptsAfter[1]).toEqual(before[0][1]);
    expect(itemsAfter.slice(1)).toEqual(before[1].slice(1));
    expect(uploadsAfter).toEqual(before[2]);
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
        "0010_receipt_item_ids": receiptItemIdsMigration,
      }),
    ),
  ),
);

it.effect(
  "moves populated categories into a lowercase catalog without changing data or history",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
      INSERT INTO receipts (
        store_name, receipt_date, category, subtotal, tax, total, created_at, updated_at
      ) VALUES
        ('First Store', '2026-10-01', 'Groceries', 11, 0, 11, '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z'),
        ('Second Store', '2026-10-03', 'Snacks', 5, 0, 5, '2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z'),
        ('Third Store', '2026-10-05', 'Grocery', 0.333, 0, 0.333, '2026-10-05T12:00:00Z', '2026-10-06T12:00:00Z'),
        ('Fourth Store', '2026-10-07', ' Groceries ', 2, 0, 2, '2026-10-07T12:00:00Z', '2026-10-08T12:00:00Z')
    `;
      // Recorded before the upgrade, with the names as they were saved.
      yield* sql`UPDATE receipts SET category = 'groceries' WHERE id = 2`;
      yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, created_at, updated_at)
      VALUES
        (1, 0, 'Apples', 11, '2026-10-01T12:00:00Z', '2026-10-05T12:00:00Z'),
        (2, 0, 'Chips', 5, '2026-10-03T12:00:00Z', '2026-10-03T12:00:00Z'),
        (3, 0, 'Pears', 0.333, '2026-10-05T12:00:00Z', '2026-10-05T12:00:00Z'),
        (4, 0, 'Milk', 2, '2026-10-07T12:00:00Z', '2026-10-07T12:00:00Z')
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
        receiptRowsWithoutCategory,
        sql`SELECT * FROM receipt_items ORDER BY id`,
        sql`SELECT * FROM receipt_uploads`,
        historyRows,
      ]);
      const before = yield* snapshot;
      expect(yield* history).toEqual([
        {
          operation: 1,
          receipt_id: "2",
          item_id: null,
          field: "category",
          before_value: "Snacks",
          after_value: "groceries",
        },
      ]);

      yield* PgMigrator.run({
        loader: PgMigrator.fromRecord(migrationsThroughReceiptCategories),
        table: "goho_migrations",
      }).pipe(Effect.provide(NodeServices.layer));

      // No receipt was edited: data, timestamps, extraction and history stay as they were.
      expect(yield* snapshot).toEqual(before);
      expect(yield* sql`SELECT name FROM categories ORDER BY name`).toEqual([
        { name: "groceries" },
        { name: "grocery" },
      ]);
      expect(
        yield* sql`
        SELECT r.id::text AS id, c.name FROM receipts r
        JOIN categories c ON c.id = r.category_id ORDER BY r.id
      `,
      ).toEqual([
        { id: "1", name: "groceries" },
        { id: "2", name: "groceries" },
        { id: "3", name: "grocery" },
        { id: "4", name: "groceries" },
      ]);

      // Moving the last receipt out of a category records names and keeps the category.
      yield* sql`
        UPDATE receipts SET category_id = (SELECT id FROM categories WHERE name = 'groceries')
        WHERE id = 3
      `;
      expect((yield* history).slice(1)).toEqual([
        {
          operation: 2,
          receipt_id: "3",
          item_id: null,
          field: "category",
          before_value: "grocery",
          after_value: "groceries",
        },
      ]);
      expect(yield* sql`SELECT count(*)::int AS count FROM categories`).toEqual([{ count: 2 }]);
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
          "0010_receipt_item_ids": receiptItemIdsMigration,
          "0011_receipt_history": receiptHistoryMigration,
        }),
      ),
    ),
);

// Existing names and the category each consolidates into.
const consolidated = {
  groceries: "groceries",
  grocery: "groceries",
  dairy: "groceries",
  "grocery and personal care": "groceries",
  produce: "groceries",
  seafood: "groceries",
  "prepared foods": "dining",
  coffee: "dining",
  "indian food": "dining",
  "baby supplies": "shopping",
  "general merchandise": "shopping",
  household: "household",
  "personal care": "personal care",
  "health and fitness": "health",
  fuel: "gas",
  "charitable donation": "charity",
  books: "books",
};

it.effect("moves populated categories onto items and consolidates them without changing data", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO categories ${sql.insert(
        Object.keys(consolidated).map((name) => ({
          name,
          created_at: "2026-10-01T12:00:00Z",
          updated_at: "2026-10-02T12:00:00Z",
        })),
      )}
    `;
    // Each receipt is named after its category; seafood is left unused.
    yield* sql`
      INSERT INTO receipts (
        store_name, receipt_date, category_id, subtotal, tax, total, created_at, updated_at
      )
      SELECT name, '2026-10-03', id, 1, 0, 1, '2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z'
      FROM categories WHERE name <> 'seafood' ORDER BY id
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, created_at, updated_at)
      SELECT id, 0, 'Item', 1, '2026-10-03T12:00:00Z', '2026-10-05T12:00:00Z'
      FROM receipts ORDER BY id
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount)
      SELECT id, 1, 'Second item', 1 FROM receipts WHERE store_name = 'groceries'
    `;
    yield* sql`
      INSERT INTO receipt_uploads (
        id, file_id, file_name, content_type, status, receipt_id,
        extraction_version, extracted_payload, created_at, updated_at
      ) VALUES (
        '7d89d8f7-6f0c-4df2-a2a9-94771638ac99', 'stored-photo', 'receipt.png', 'image/png',
        'succeeded', 1, 1, '{"transaction":{"category":"Groceries"}}'::jsonb,
        '2026-10-01T11:59:00Z', '2026-10-01T12:00:00Z'
      )
    `;
    // History recorded before the upgrade, including a receipt category change.
    yield* sql`
      UPDATE receipts SET category_id = (SELECT id FROM categories WHERE name = 'coffee')
      WHERE store_name = 'grocery'
    `;
    yield* sql`UPDATE receipt_items SET name = 'Renamed' WHERE position = 1`;
    const categoryTimes = sql`SELECT id, created_at, updated_at FROM categories ORDER BY id`;
    const snapshot = Effect.all([
      receiptRowsWithoutCategory,
      itemRowsWithoutCategory,
      sql`SELECT * FROM receipt_uploads`,
      historyRows,
    ]);
    const before = yield* snapshot;
    const timesBefore = yield* categoryTimes;
    const idsBefore = new Map(
      (yield* sql<{ id: string; name: string }>`SELECT id::text, name FROM categories`).map(
        ({ id, name }) => [name, id],
      ),
    );
    expect((yield* history).map(({ field, after_value }) => ({ field, after_value }))).toEqual([
      { field: "category", after_value: "coffee" },
      { field: "item_name", after_value: "Renamed" },
    ]);

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    // Nothing was edited: data, timestamps, extraction and history stay as they were.
    expect(yield* snapshot).toEqual(before);
    // An existing canonical name, or else its oldest alias, keeps its ID and timestamps.
    expect(
      yield* sql`SELECT id::text, name, icon, color FROM categories ORDER BY categories.id`,
    ).toEqual([
      { id: idsBefore.get("groceries"), name: "groceries", icon: "groceries", color: "green" },
      { id: idsBefore.get("prepared foods"), name: "dining", icon: "meals", color: "orange" },
      { id: idsBefore.get("baby supplies"), name: "shopping", icon: "shopping", color: "purple" },
      { id: idsBefore.get("household"), name: "household", icon: "home", color: "brown" },
      {
        id: idsBefore.get("personal care"),
        name: "personal care",
        icon: "personal_care",
        color: "pink",
      },
      { id: idsBefore.get("health and fitness"), name: "health", icon: "health", color: "red" },
      { id: idsBefore.get("fuel"), name: "gas", icon: "transport", color: "blue" },
      { id: idsBefore.get("charitable donation"), name: "charity", icon: "other", color: "grey" },
      { id: idsBefore.get("books"), name: "books", icon: "other", color: "grey" },
      // Seeded for books by a later migration.
      { id: expect.any(String), name: "fiction", icon: "other", color: "grey" },
      { id: expect.any(String), name: "nonfiction", icon: "other", color: "grey" },
    ]);
    const timesAfter = yield* categoryTimes;
    expect(timesBefore.filter(({ id }) => timesAfter.some((row) => row.id === id))).toEqual(
      timesAfter.filter(({ id }) => timesBefore.some((row) => row.id === id)),
    );
    // Every item inherits its receipt's consolidated category.
    expect(
      yield* sql`
        SELECT r.store_name, c.name AS category
        FROM receipt_items i JOIN receipts r ON r.id = i.receipt_id
        JOIN categories c ON c.id = i.category_id ORDER BY i.id
      `,
    ).toEqual([
      ...Object.entries(consolidated)
        .filter(([name]) => name !== "seafood")
        .map(([store_name, category]) => ({
          store_name,
          category: store_name === "grocery" ? "dining" : category,
        })),
      { store_name: "groceries", category: "groceries" },
    ]);

    // Later category edits record item history by name and touch the item and its receipt.
    const repo = yield* Effect.provide(Repository.Service, RepositoriesLive);
    const [books] = yield* sql<{ receipt_id: string; id: string }>`
      SELECT i.receipt_id::text, i.id::text FROM receipt_items i
      JOIN receipts r ON r.id = i.receipt_id WHERE r.store_name = 'books'
    `;
    const receiptId = ReceiptId.make(books!.receipt_id);
    const receiptBefore = yield* receiptTimes(receiptId);
    const itemBefore = yield* itemTimes(receiptId);
    yield* repo.updateItem(receiptId, ReceiptItemId.make(books!.id), { category: "Shopping" });
    expect((yield* receiptTimes(receiptId)).updated_at).not.toBe(receiptBefore.updated_at);
    expect((yield* itemTimes(receiptId))[0]!.updated_at).not.toBe(itemBefore[0]!.updated_at);
    const [receiptHistory, itemHistory] = yield* historyRows;
    expect(receiptHistory).toEqual(before[3][0]);
    expect(itemHistory.slice(0, -1)).toEqual(before[3][1]);
    expect((yield* history).slice(2)).toEqual([
      {
        operation: 3,
        receipt_id: books!.receipt_id,
        item_id: books!.id,
        field: "category",
        before_value: "books",
        after_value: "shopping",
      },
    ]);
    expect(yield* Migrations.run().pipe(Effect.provide(NodeServices.layer))).toEqual([]);
  }).pipe(Effect.provide(migratedDatabase(migrationsThroughReceiptCategories))),
);

it.effect("makes populated categories receipt categories without changing data or history", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // An existing fiction category keeps its own metadata through the book seed.
    yield* sql`
      INSERT INTO categories (name, icon, color, created_at, updated_at) VALUES
        ('fiction', 'mdi:book', 'purple', '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z'),
        ('snacks', 'other', 'grey', '2026-10-01T12:00:00Z', '2026-10-03T12:00:00Z')
    `;
    yield* sql`
      INSERT INTO receipts (
        store_name, receipt_date, subtotal, tax, total, created_at, updated_at
      ) VALUES ('Book Store', '2026-10-03', 5, 0, 5, '2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z')
    `;
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount, category_id)
      SELECT receipts.id, 0, 'Novel', 5, categories.id
      FROM receipts, categories WHERE categories.name = 'fiction'
    `;
    // History recorded before the upgrade.
    yield* sql`
      UPDATE receipt_items SET category_id = (SELECT id FROM categories WHERE name = 'snacks')
    `;
    const categoryRows = sql`SELECT id, name, icon, color, created_at, updated_at FROM categories ORDER BY id`;
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts ORDER BY id`,
      sql`SELECT * FROM receipt_items ORDER BY id`,
      historyRows,
    ]);
    const before = yield* snapshot;
    const categoriesBefore = yield* categoryRows;
    expect(before[2][1]).toHaveLength(1);

    yield* Migrations.run().pipe(Effect.provide(NodeServices.layer));

    expect(yield* snapshot).toEqual(before);
    // Existing categories keep their IDs, metadata and timestamps; only nonfiction is new.
    const categoriesAfter = yield* categoryRows;
    expect(categoriesAfter.slice(0, -1)).toEqual(categoriesBefore);
    expect(categoriesAfter.at(-1)).toMatchObject({ name: "nonfiction", icon: "other" });
    const seededInOrder = [
      "groceries",
      "dining",
      "shopping",
      "household",
      "personal care",
      "health",
      "gas",
      "charity",
    ];
    expect(yield* sql`SELECT name, to_jsonb(kinds) AS kinds FROM categories ORDER BY id`).toEqual([
      ...seededInOrder.map((name) => ({ name, kinds: ["receipt"] })),
      { name: "fiction", kinds: ["receipt", "book"] },
      { name: "snacks", kinds: ["receipt"] },
      { name: "nonfiction", kinds: ["book"] },
    ]);
    // Receipt extraction is offered every receipt category, but not book-only ones.
    const categories = yield* Effect.provide(CategoryRepository.Service, CategoryRepository.layer);
    expect(yield* categories.listNamesForCategory("receipt")).toEqual(
      [...seededNames, "fiction", "snacks"].sort(),
    );
    expect(yield* categories.listNamesForCategory("book")).toEqual(["fiction", "nonfiction"]);
    expect(yield* Migrations.run().pipe(Effect.provide(NodeServices.layer))).toEqual([]);
  }).pipe(
    Effect.provide(
      migratedDatabase({
        ...migrationsThroughReceiptCategories,
        "0013_item_categories": itemCategoriesMigration,
      }),
    ),
  ),
);

it.effect("records each changed receipt field and item rename, grouped per row update", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* repo.insert(receiptInput);
    // An unrelated receipt, so the whole-table history checks also show isolation.
    yield* repo.insert(receiptInput);
    const [apples] = yield* itemIds(receiptId);
    expect(yield* history).toEqual([]);

    yield* repo.update(receiptId, { storeName: "Corner Store", receiptDate: "2024-09-02" });
    const receiptEdit = { operation: 1, receipt_id: receiptId, item_id: null };
    expect(yield* history).toEqual([
      {
        ...receiptEdit,
        field: "receipt_date",
        before_value: "2024-09-01",
        after_value: "2024-09-02",
      },
      {
        ...receiptEdit,
        field: "store_name",
        before_value: "Example Store",
        after_value: "Corner Store",
      },
    ]);
    // The edit time is the instant the receipt records as its update.
    expect(
      yield* sql`
        SELECT DISTINCT history.edited_at = receipt.updated_at AS matches_update
        FROM receipt_history history JOIN receipts receipt ON receipt.id = history.receipt_id
      `,
    ).toEqual([{ matches_update: true }]);

    const receiptBefore = yield* receiptTimes(receiptId);
    yield* repo.updateItem(receiptId, apples!, { name: "Pears" });
    yield* repo.updateItem(receiptId, apples!, { name: "Granny Smith apples", category: "Snacks" });
    yield* repo.updateItem(receiptId, apples!, { category: "Household" });
    // The item edits touched the parent receipt without adding receipt history.
    expect((yield* receiptTimes(receiptId)).updated_at).not.toBe(receiptBefore.updated_at);
    const itemEdit = { receipt_id: receiptId, item_id: apples };
    const categoryEdit = { ...itemEdit, field: "category" };
    const nameEdit = { ...itemEdit, field: "item_name" };
    expect((yield* history).slice(2)).toEqual([
      { ...nameEdit, operation: 2, before_value: "Apples", after_value: "Pears" },
      { ...categoryEdit, operation: 3, before_value: "groceries", after_value: "snacks" },
      { ...nameEdit, operation: 3, before_value: "Pears", after_value: "Granny Smith apples" },
      { ...categoryEdit, operation: 4, before_value: "snacks", after_value: "household" },
    ]);
    expect(
      yield* sql`
        SELECT history.edited_at = item.updated_at AS matches_update
        FROM receipt_item_history history JOIN receipt_items item ON item.id = history.item_id
        ORDER BY history.id
      `,
    ).toEqual([false, false, false, true].map((matches_update) => ({ matches_update })));
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("records nothing for inserts, same values, omitted fields, or untracked columns", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const [apples] = yield* itemIds(receiptId);
    const original = Option.getOrThrow(yield* repo.findById(receiptId));

    yield* repo.update(receiptId, {
      storeName: original.storeName,
      receiptDate: original.receiptDate,
    });
    yield* repo.update(receiptId, {});
    // A case-only category change keeps the same category, so it is not an edit.
    yield* repo.updateItem(receiptId, apples!, {
      name: "Apples",
      category: original.items[0].category.name.toUpperCase(),
    });
    yield* sql`UPDATE receipts SET store_name = store_name, receipt_date = '2024-09-01'::date`;
    yield* sql`UPDATE receipts SET created_at = '2000-01-01T00:00:00Z', updated_at = now()`;
    yield* sql`UPDATE receipts SET subtotal = 20, tax = 2, total = 22, currency = 'USD'`;
    yield* sql`UPDATE receipt_items SET amount = amount + 1, position = position + 10`;
    yield* sql`UPDATE receipt_items SET updated_at = now(), name = name, category_id = category_id`;
    yield* sql`UPDATE receipt_uploads SET file_name = 'renamed.png'`;
    expect(yield* history).toEqual([]);

    // Only tracked columns whose values change are recorded from a mixed update.
    yield* sql`UPDATE receipts SET store_name = 'Corner Store', total = 30`;
    yield* repo.update(receiptId, { storeName: "Corner Store" });
    yield* repo.updateItem(receiptId, apples!, { name: "Apples", category: "Snacks" });
    yield* sql`
      UPDATE receipt_items SET name = 'Pears', amount = 5, category_id = category_id
      WHERE id = ${apples!}
    `;
    expect(yield* history).toEqual([
      {
        operation: 1,
        receipt_id: receiptId,
        item_id: null,
        field: "store_name",
        before_value: "Example Store",
        after_value: "Corner Store",
      },
      {
        operation: 2,
        receipt_id: receiptId,
        item_id: apples,
        field: "category",
        before_value: "groceries",
        after_value: "snacks",
      },
      {
        operation: 3,
        receipt_id: receiptId,
        item_id: apples,
        field: "item_name",
        before_value: "Apples",
        after_value: "Pears",
      },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("records direct SQL edits per row update in any session date style and time zone", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const first = yield* repo.insert(receiptInput);
    const second = yield* repo.insert(receiptInput);
    const [apples, adjustment] = yield* itemIds(first);
    yield* sql`INSERT INTO categories (name) VALUES ('snacks')`;
    // History records the referenced names when a category reference changes.
    const setCategory = (name: string) => sql`
      UPDATE receipt_items SET category_id = (SELECT id FROM categories WHERE name = ${name})
      WHERE id = ${apples!}
    `;

    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`SET LOCAL DateStyle = 'SQL, DMY'`;
        yield* sql`SET LOCAL TIME ZONE 'Pacific/Chatham'`;
        // DMY input: the second of September.
        yield* sql`UPDATE receipts SET receipt_date = '02/09/2024'`;
        yield* setCategory("snacks");
        yield* setCategory("household");
        yield* sql`UPDATE receipt_items SET name = upper(name) WHERE receipt_id = ${first}`;
        expect(yield* sql`SELECT receipt_date::text FROM receipts WHERE id = ${first}`).toEqual([
          { receipt_date: "02/09/2024" },
        ]);
      }),
    );

    const dateEdit = { item_id: null, field: "receipt_date" };
    const dates = { before_value: "2024-09-01", after_value: "2024-09-02" };
    const categoryEdit = { receipt_id: first, item_id: apples, field: "category" };
    const itemEdit = { receipt_id: first, field: "item_name" };
    expect(yield* history).toEqual([
      { operation: 1, receipt_id: first, ...dateEdit, ...dates },
      { operation: 2, receipt_id: second, ...dateEdit, ...dates },
      { operation: 3, ...categoryEdit, before_value: "groceries", after_value: "snacks" },
      { operation: 4, ...categoryEdit, before_value: "snacks", after_value: "household" },
      { operation: 5, ...itemEdit, item_id: apples, before_value: "Apples", after_value: "APPLES" },
      {
        operation: 6,
        ...itemEdit,
        item_id: adjustment,
        before_value: "Adjustment",
        after_value: "ADJUSTMENT",
      },
    ]);
    // A wall-clock time stored in the Chatham zone would be about 13 hours in the future.
    expect(
      yield* sql`
        SELECT bool_and(edited_at BETWEEN now() - interval '1 minute' AND now()) AS recent
        FROM (
          SELECT edited_at FROM receipt_history
          UNION ALL
          SELECT edited_at FROM receipt_item_history
        ) history
      `,
    ).toEqual([{ recent: true }]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("rolls back edits whose history cannot be recorded, including within savepoints", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const receiptId = yield* insertScannedReceipt;
    const [apples] = yield* itemIds(receiptId);
    // Lets an edit itself succeed while recording its history fails.
    for (const table of ["receipt_history", "receipt_item_history"]) {
      yield* sql`
        ALTER TABLE ${sql(table)}
          ADD CONSTRAINT reject_history CHECK (lower(after_value) <> 'unrecordable')
      `;
    }
    yield* sql`INSERT INTO categories (name) VALUES ('snacks')`;
    const snapshot = Effect.all([
      sql`SELECT * FROM receipts`,
      sql`SELECT * FROM receipt_items ORDER BY position`,
      sql`SELECT * FROM receipt_uploads`,
      catalogRows,
      historyRows,
    ]);
    const before = yield* snapshot;

    const persistenceError = "GohoServer.ReceiptRepository.PersistenceError";
    const attempts: ReadonlyArray<readonly [Effect.Effect<unknown, { _tag: string }>, string]> = [
      [
        repo.update(receiptId, { receiptDate: "2024-09-02", storeName: "Unrecordable" }),
        persistenceError,
      ],
      [repo.updateItem(receiptId, apples!, { name: "Unrecordable" }), persistenceError],
      // The category it would create rolls back too.
      [
        repo.updateItem(receiptId, apples!, { name: "Pears", category: "Unrecordable" }),
        persistenceError,
      ],
      [
        sql`
          UPDATE receipt_items SET name = 'Unrecordable',
            category_id = (SELECT id FROM categories WHERE name = 'snacks')
        `,
        "SqlError",
      ],
    ];
    for (const [attempt, tag] of attempts) {
      const result = yield* Effect.result(attempt);
      expect(Result.isFailure(result) && result.failure._tag).toBe(tag);
      expect(yield* snapshot).toEqual(before);
    }

    // Failed savepoints inside a committed transaction leave only the surviving edits.
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* repo.update(receiptId, { storeName: "Corner Store" });
        const discarded = yield* sql
          .withTransaction(
            repo
              .updateItem(receiptId, apples!, { name: "Pears" })
              .pipe(Effect.andThen(new LaterStepFailed())),
          )
          .pipe(Effect.result);
        expect(Result.isFailure(discarded)).toBe(true);
        const unrecordable = yield* repo
          .updateItem(receiptId, apples!, { category: "Unrecordable" })
          .pipe(Effect.result);
        expect(Result.isFailure(unrecordable)).toBe(true);
        yield* repo.updateItem(receiptId, apples!, { name: "Granny Smith apples" });
      }),
    );
    expect(yield* history).toEqual([
      {
        operation: 1,
        receipt_id: receiptId,
        item_id: null,
        field: "store_name",
        before_value: "Example Store",
        after_value: "Corner Store",
      },
      {
        operation: 2,
        receipt_id: receiptId,
        item_id: apples,
        field: "item_name",
        before_value: "Apples",
        after_value: "Granny Smith apples",
      },
    ]);
    const saved = Option.getOrThrow(yield* repo.findById(receiptId));
    expect(saved.storeName).toBe("Corner Store");
    expect(saved.items[0]).toMatchObject({
      name: "Granny Smith apples",
      category: { name: "groceries" },
    });
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual(before[2]);
    expect(yield* catalogRows).toEqual(before[3]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("deletes edit history with its receipt or item and keeps other history", () =>
  Effect.gen(function* () {
    const repo = yield* Repository.Service;
    const sql = yield* SqlClient.SqlClient;
    const scanned = yield* insertScannedReceipt;
    const retained = yield* repo.insert(receiptInput);
    const [scannedItem] = yield* itemIds(scanned);
    const [kept, removed] = yield* itemIds(retained);
    for (const [receiptId, itemId] of [
      [scanned, scannedItem!],
      [retained, kept!],
      [retained, removed!],
    ] as const) {
      yield* repo.updateItem(receiptId, itemId, { name: "Pears" });
    }
    yield* repo.updateItem(scanned, scannedItem!, { category: "Snacks" });
    yield* repo.update(retained, { storeName: "Corner Store" });

    yield* sql`DELETE FROM receipt_items WHERE id = ${removed!}`;
    expect(yield* repo.delete(scanned)).toEqual(Option.some({ fileId: "stored-photo" }));
    expect(yield* sql`SELECT * FROM receipt_uploads`).toEqual([]);
    expect(yield* history).toEqual([
      {
        operation: 1,
        receipt_id: retained,
        item_id: kept,
        field: "item_name",
        before_value: "Apples",
        after_value: "Pears",
      },
      {
        operation: 2,
        receipt_id: retained,
        item_id: null,
        field: "store_name",
        before_value: "Example Store",
        after_value: "Corner Store",
      },
    ]);
  }).pipe(Effect.provide(DatabaseLive)),
);
