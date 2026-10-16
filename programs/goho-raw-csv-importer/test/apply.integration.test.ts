import { createRequire } from "node:module";

import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { Config, Context, Crypto, Effect, Layer, Path, Redacted, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { rawCsv, runImporter, runNode, writeCsv } from "./support/cli.ts";

// The server's own migration command runs in a child process so the importer
// tests use the real schema without depending on server runtime internals.
const serverPackage = createRequire(import.meta.url).resolve("@goho/goho-server/package.json");

/**
 * Creates a uniquely named schema, migrates it with the server migration CLI,
 * and drops it when the test scope closes. Nothing touches other schemas.
 */
const migratedSchema = Effect.gen(function* () {
  const url = yield* Config.Redacted("TEST_DATABASE_URL");
  const admin = Context.get(
    yield* Layer.build(Postgres.layer({ url, maxConnections: 1 })),
    SqlClient.SqlClient,
  );
  const crypto = yield* Crypto.Crypto;
  const schema = `test_${(yield* crypto.randomUUIDv4).replaceAll("-", "")}`;
  yield* Effect.acquireRelease(admin`CREATE SCHEMA ${admin(schema)}`, () =>
    admin`DROP SCHEMA ${admin(schema)} CASCADE`.pipe(Effect.orDie),
  );
  const schemaUrl = new URL(Redacted.value(url));
  const options = schemaUrl.searchParams.get("options") ?? "";
  schemaUrl.searchParams.set("options", `${options} -c search_path=${schema}`.trim());
  const databaseUrl = schemaUrl.toString();

  const path = yield* Path.Path;
  const migration = yield* runNode(
    path.join(path.dirname(serverPackage), "src/database/migrate.ts"),
    [],
    { DATABASE_URL: databaseUrl },
  );
  expect(migration.code, migration.stderr).toBe(0);

  const sql = Context.get(
    yield* Layer.build(Postgres.layer({ url: Redacted.make(databaseUrl) })),
    SqlClient.SqlClient,
  );
  expect(yield* sql`SELECT current_schema() AS schema`).toEqual([{ schema }]);
  return { databaseUrl, sql };
});

const TestLive = Layer.mergeAll(NodeServices.layer, NodeCrypto.layer);

const importCsv = rawCsv(
  "  Metro ,2011-10-26,Grocery,Apple,0.10,file-1",
  "Costco,40842,Household,Soap,12345678901234567890.123456789,file-2",
  "METRO,40842,Grocery,Apple,0.10,file-3",
  "Metro,2011-10-26,Household,Refund,-1.00,",
  "metro,2011-10-26,Grocery,Free bag,0,",
  'Metro,2011-10-26,Grocery,"Bread, ""rye""',
  'loaf",0.20,',
);

const decodeIdRow = Schema.decodeUnknownEffect(
  Schema.Tuple([Schema.Struct({ id: Schema.String })]),
);

const seedExistingRecords = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    const [{ id }] = yield* sql`
      INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total, currency)
      VALUES ('Existing Store', '2026-09-01', 'Groceries', 10, 1, 11, 'USD')
      RETURNING id::text AS id
    `.pipe(Effect.flatMap(decodeIdRow));
    yield* sql`
      INSERT INTO receipt_items (receipt_id, position, name, amount)
      VALUES (${id}, 0, 'Existing item', 10)
    `;
    yield* sql`
      INSERT INTO receipt_uploads (
        id, file_id, file_name, content_type, status, receipt_id, extraction_version, extracted_payload
      ) VALUES (
        '7d89d8f7-6f0c-4df2-a2a9-94771638ac99', 'stored-photo', 'receipt.png', 'image/png',
        'succeeded', ${id}, 1, '{}'::jsonb
      )
    `;
    return id;
  });

const snapshot = (sql: SqlClient.SqlClient) =>
  Effect.all({
    receipts: sql`SELECT * FROM receipts ORDER BY id`,
    items: sql`SELECT * FROM receipt_items ORDER BY receipt_id, position`,
    uploads: sql`SELECT * FROM receipt_uploads ORDER BY id`,
  });

const counts = (sql: SqlClient.SqlClient) =>
  sql<{ receipts: number; items: number; uploads: number }>`
    SELECT
      (SELECT count(*)::int FROM receipts) AS receipts,
      (SELECT count(*)::int FROM receipt_items) AS items,
      (SELECT count(*)::int FROM receipt_uploads) AS uploads
  `;

const importedIds = (sql: SqlClient.SqlClient, afterId: string) =>
  sql<{ id: string }>`SELECT id::text AS id FROM receipts WHERE id > ${afterId} ORDER BY id`;

const importedReceipts = (sql: SqlClient.SqlClient, afterId: string) =>
  sql`
    SELECT r.store_name, r.receipt_date::text AS receipt_date, r.category,
      r.subtotal::text AS subtotal, r.tax::text AS tax, r.total::text AS total, r.currency,
      r.updated_at >= r.created_at AS timestamps_ordered,
      r.created_at >= statement_timestamp() - interval '5 minutes' AS created_recently,
      COALESCE(json_agg(json_build_object('position', i.position, 'name', i.name,
        'amount', i.amount::text) ORDER BY i.position) FILTER (WHERE i.position IS NOT NULL),
        '[]') AS items
    FROM receipts r LEFT JOIN receipt_items i ON i.receipt_id = r.id
    WHERE r.id > ${afterId}
    GROUP BY r.id ORDER BY r.id
  `;

const expectedReceipts = [
  {
    store_name: "Metro",
    receipt_date: "2011-10-26",
    category: "Grocery",
    subtotal: "0.40",
    tax: "0.05",
    total: "0.45",
    currency: "CAD",
    timestamps_ordered: true,
    created_recently: true,
    items: [
      { position: 0, name: "Apple", amount: "0.10" },
      { position: 1, name: "Apple", amount: "0.10" },
      { position: 2, name: "Free bag", amount: "0" },
      { position: 3, name: 'Bread, "rye"\nloaf', amount: "0.20" },
    ],
  },
  {
    store_name: "Costco",
    receipt_date: "2011-10-26",
    category: "Household",
    subtotal: "12345678901234567890.123456789",
    tax: "1604938257160493825.72",
    total: "13950617158395061715.843456789",
    currency: "CAD",
    timestamps_ordered: true,
    created_recently: true,
    items: [{ position: 0, name: "Soap", amount: "12345678901234567890.123456789" }],
  },
];

describe("apply", () => {
  it.effect("inserts exactly the planned receipts and preserves existing records and uploads", () =>
    Effect.gen(function* () {
      const { databaseUrl, sql } = yield* migratedSchema;
      const existingId = yield* seedExistingRecords(sql);
      const before = yield* snapshot(sql);
      const file = yield* writeCsv(importCsv);

      const result = yield* runImporter(["--file", file, "--apply"], {
        DATABASE_URL: databaseUrl,
      });

      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Inserted 2 receipts with 5 items in one transaction. Running --apply again inserts duplicates.",
      );
      expect(yield* importedReceipts(sql, existingId)).toEqual(expectedReceipts);
      // Generated identities follow existing rows; the importer never supplies IDs.
      expect((yield* importedIds(sql, existingId)).length).toBe(2);
      expect(yield* counts(sql)).toEqual([{ receipts: 3, items: 6, uploads: 1 }]);

      const after = yield* snapshot(sql);
      expect(after.uploads).toEqual(before.uploads);
      expect(after.receipts.filter((row) => String(row["id"]) === existingId)).toEqual(
        before.receipts,
      );
      expect(after.items.filter((row) => String(row["receipt_id"]) === existingId)).toEqual(
        before.items,
      );
    }).pipe(Effect.scoped, Effect.provide(TestLive)),
  );

  it.effect("inserts again on every apply, intentionally creating duplicates", () =>
    Effect.gen(function* () {
      const { databaseUrl, sql } = yield* migratedSchema;
      const file = yield* writeCsv(importCsv);
      const apply = runImporter(["--file", file, "--apply"], { DATABASE_URL: databaseUrl });
      expect((yield* apply).code).toBe(0);
      expect((yield* apply).code).toBe(0);
      expect(yield* counts(sql)).toEqual([{ receipts: 4, items: 10, uploads: 0 }]);
      expect(yield* importedReceipts(sql, "0")).toEqual([...expectedReceipts, ...expectedReceipts]);
      expect(new Set((yield* importedIds(sql, "0")).map(({ id }) => id)).size).toBe(4);
    }).pipe(Effect.scoped, Effect.provide(TestLive)),
  );

  it.effect("rolls back every receipt when a later insert fails", () =>
    Effect.gen(function* () {
      const { databaseUrl, sql } = yield* migratedSchema;
      const existingId = yield* seedExistingRecords(sql);
      const before = yield* snapshot(sql);
      // Deterministic failure on the second receipt's items, after the first
      // receipt, its four items, and the second receipt row were inserted.
      yield* sql`ALTER TABLE receipt_items ADD CONSTRAINT reject_soap CHECK (name <> 'Soap')`;
      const file = yield* writeCsv(importCsv);

      const result = yield* runImporter(["--file", file, "--apply"], {
        DATABASE_URL: databaseUrl,
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Receipts planned: 2 with 5 items");
      expect(result.stdout).not.toContain("Inserted");
      // The SQL wrapper does not surface the constraint name, so assert only the user-facing claim.
      expect(result.stderr).toMatch(
        /^Import failed and was rolled back; nothing was written\. Cause: .+\n$/u,
      );
      expect(yield* snapshot(sql)).toEqual(before);
      expect(yield* counts(sql)).toEqual([{ receipts: 1, items: 1, uploads: 1 }]);

      // Identity sequences are not transactional: the next ID skipping two values
      // proves both receipt inserts ran before the transaction rolled back.
      yield* sql`ALTER TABLE receipt_items DROP CONSTRAINT reject_soap`;
      const [{ id: probeId }] = yield* sql`
        INSERT INTO receipts (store_name, receipt_date, category, subtotal, tax, total)
        VALUES ('Probe', '2026-09-02', 'Groceries', 1, 0, 1)
        RETURNING id::text AS id
      `.pipe(Effect.flatMap(decodeIdRow));
      expect(BigInt(probeId)).toBe(BigInt(existingId) + 3n);
    }).pipe(Effect.scoped, Effect.provide(TestLive)),
  );

  it.effect("writes nothing when the file has validation errors", () =>
    Effect.gen(function* () {
      const { databaseUrl, sql } = yield* migratedSchema;
      const file = yield* writeCsv(
        rawCsv("Metro,2024-12-31,Grocery,Milk,1.00,", "Metro,2024-02-30,Grocery,Eggs,2.00,"),
      );

      const result = yield* runImporter(["--file", file, "--apply"], {
        DATABASE_URL: databaseUrl,
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toBe(
        "Import blocked: 1 validation errors must be fixed. Nothing was written.\n",
      );
      expect(yield* counts(sql)).toEqual([{ receipts: 0, items: 0, uploads: 0 }]);
    }).pipe(Effect.scoped, Effect.provide(TestLive)),
  );
});
