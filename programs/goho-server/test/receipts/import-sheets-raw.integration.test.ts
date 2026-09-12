import { randomUUID } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { GoogleSheets, Postgres } from "@goho/core";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect } from "vitest";

import * as Migrations from "../../src/database/migrations.ts";
import { run } from "../../src/receipts/import-sheets-raw.ts";
import * as Repository from "../../src/receipts/repository.ts";

const header = ["store", "date", "category", "item", "price", "source_file_id"] as const;

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

const sheetsLayer = (rows: ReadonlyArray<GoogleSheets.Row>) =>
  Layer.succeed(GoogleSheets.Service, {
    readRows: () => Effect.succeed(rows),
    appendRows: () =>
      Effect.fail(new GoogleSheets.SheetsError({ operation: "appendRows", message: "unused" })),
  });

it.effect("applies a blank-F merge once and skips the same source on re-run", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const request = { spreadsheetId: "sheet-1", worksheet: "RAW", apply: true };
    const first = yield* run(request);
    const second = yield* run(request);
    expect(first).toMatchObject({
      apply: true,
      receiptCount: 1,
      imported: 1,
      skippedAlreadyPresent: 0,
      skippedInvalid: 0,
    });
    expect(second).toMatchObject({
      imported: 0,
      skippedAlreadyPresent: 1,
      skippedInvalid: 0,
    });
    expect(yield* sql`SELECT count(*)::int AS count FROM receipts`).toEqual([{ count: 1 }]);
    expect(
      yield* sql`
      SELECT source_provider, source_file_id, store_name, receipt_date::text,
        category, subtotal, tax, total, extracted_payload
      FROM receipts
    `,
    ).toEqual([
      {
        source_provider: "google_sheets",
        source_file_id: "sheet:sheet-1:Costco:2024-06-01",
        store_name: "Costco",
        receipt_date: "2024-06-01",
        category: "Groceries",
        subtotal: "7",
        tax: "0.91",
        total: "7.91",
        extracted_payload: {
          importedFrom: "google_sheets_raw",
          store: { name: "Costco" },
          date: "2024-06-01",
          transaction: {
            items: [
              { name: "Milk", price: 3 },
              { name: "Eggs", price: 4 },
            ],
            category: "Groceries",
            subtotal: 7,
            tax: 0.91,
            total: 7.91,
          },
        },
      },
    ]);
    expect(
      yield* sql`SELECT position, name, amount FROM receipt_items ORDER BY position`,
    ).toEqual([
      { position: 0, name: "Milk", amount: "3" },
      { position: 1, name: "Eggs", amount: "4" },
    ]);
  }).pipe(
    Effect.provide(
      Layer.merge(
        DatabaseLive,
        sheetsLayer([
          header,
          ["Costco", "2024-06-01", "Groceries", "Milk", 3, ""],
          [],
          ["Costco", "2024-06-01", "Pharmacy", "Eggs", 4, ""],
        ]),
      ),
    ),
  ),
);

it.effect("persists a real-F group so later live source ids would already exist", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const result = yield* run({ spreadsheetId: "sheet-1", worksheet: "RAW", apply: true });
    expect(result.imported).toBe(1);
    expect(
      yield* sql`
      SELECT source_provider, source_file_id FROM receipts
    `,
    ).toEqual([{ source_provider: "google_drive", source_file_id: "drive-file-1" }]);
  }).pipe(
    Effect.provide(
      Layer.merge(
        DatabaseLive,
        sheetsLayer([
          header,
          ["Costco", "2026-01-02", "Groceries", "Milk", 3.5, "drive-file-1"],
          ["Costco", "2026-01-02", "Groceries", "Eggs", 4, "drive-file-1"],
        ]),
      ),
    ),
  ),
);
