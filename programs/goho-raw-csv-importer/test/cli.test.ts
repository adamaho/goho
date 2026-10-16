import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { rawCsv, runImporter, writeCsv } from "./support/cli.ts";

const validCsv = rawCsv(
  "Metro,2024-12-31,Grocery,Milk,0.10,",
  "Costco,2024-12-31,Household,Soap,5.00,",
  "METRO,45657,Grocery,Eggs,0.20,",
  "Metro,2024-12-31,Grocery,Refund,-1.00,",
);

const invalidCsv = rawCsv(
  "Metro,2024-12-31,Grocery,Milk,0.10,",
  "Metro,01/02/2024,Grocery,Eggs,0.20,",
  "Metro,2024-12-31,,Bread,abc,",
);

// Points at a closed local port; any connection attempt fails quickly and visibly.
const unreachableDatabase = { DATABASE_URL: "postgres://goho:secret@127.0.0.1:1/goho" };

describe("dry run", () => {
  it.effect("previews calculated receipts offline without any database configuration", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(validCsv);
      const result = yield* runImporter(["--file", file]);
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        [
          `RAW CSV import plan for ${file}`,
          "",
          'Receipt 1: "Metro" on 2024-12-31, category "Grocery"',
          '  0. "Milk" 0.10 CAD (record 2, line 2)',
          '  1. "Eggs" 0.20 CAD (record 4, line 4)',
          "  Subtotal 0.30 CAD; calculated tax 0.04 CAD; calculated total 0.34 CAD",
          "",
          'Receipt 2: "Costco" on 2024-12-31, category "Household"',
          '  0. "Soap" 5.00 CAD (record 3, line 3)',
          "  Subtotal 5.00 CAD; calculated tax 0.65 CAD; calculated total 5.65 CAD",
          "",
          "Skipped negative-price records (excluded from amounts and category):",
          '  record 5, line 5: "Metro" on 2024-12-31, "Refund" -1.00',
          "",
          "Records: 4 data, 0 blank, 3 retained items, 1 skipped negative, 0 validation errors",
          "Receipts planned: 2 with 3 items",
          "Tax and totals are calculated, not read from the CSV: tax = 13% of each receipt subtotal, rounded once to cents (ties away from zero); total = subtotal + tax. All amounts are CAD without conversion.",
          "Dry run: the CSV is importable. Nothing was written; re-run with --apply to insert.",
          "",
        ].join("\n"),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("ignores a configured database during a dry run", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(validCsv);
      const result = yield* runImporter(["--file", file], unreachableDatabase);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Nothing was written");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reports every validation error and exits nonzero without claiming importability", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(invalidCsv);
      const result = yield* runImporter(["--file", file]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        [
          "Validation errors:",
          '  record 3, line 3: date "01/02/2024" is ambiguous; use YYYY-MM-DD',
          "  record 4, line 4: category is required",
          '  record 4, line 4: price "abc" is not a plain decimal such as 12.34 (no currency symbols, thousands separators, or plus signs)',
        ].join("\n"),
      );
      expect(result.stdout).toContain('Receipt 1: "Metro" on 2024-12-31');
      expect(result.stdout).not.toContain("importable");
      expect(result.stderr).toBe(
        "Import blocked: 3 validation errors must be fixed. Nothing was written.\n",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails visibly on malformed CSV", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(rawCsv('Metro,2024-12-31,Grocery,"Milk,0.10,'));
      const result = yield* runImporter(["--file", file]);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Quote Not Closed");
      expect(result.stderr).toContain("Import blocked: the CSV could not be read reliably.");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails visibly on a wrong header", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv("store,date,item,price\nMetro,2024-12-31,Milk,1.00\n");
      const result = yield* runImporter(["--file", file]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'CSV header must have 6 fields (store,date,category,item,price,source_file_id) but had 4: ["store","date","item","price"]',
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails visibly when the file cannot be read or --file is missing", () =>
    Effect.gen(function* () {
      const missing = yield* runImporter(["--file", "/nonexistent/goho/raw.csv"]);
      expect(missing.code).toBe(1);
      expect(missing.stderr).toBe("RAW CSV file could not be read: /nonexistent/goho/raw.csv\n");

      const noFlag = yield* runImporter([]);
      expect(noFlag.code).toBe(1);
      expect(noFlag.stderr).toContain("Missing required flag: --file");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("apply guards", () => {
  it.effect("validates the whole file before connecting and writes nothing on errors", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(invalidCsv);
      const result = yield* runImporter(["--file", file, "--apply"], unreachableDatabase);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Validation errors:");
      expect(result.stderr).toBe(
        "Import blocked: 3 validation errors must be fixed. Nothing was written.\n",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("requires DATABASE_URL only when applying valid input", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(validCsv);
      const result = yield* runImporter(["--file", file, "--apply"]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Receipts planned: 2 with 3 items");
      expect(result.stderr).toBe("DATABASE_URL is required with --apply.\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reports connection failure without retrying", () =>
    Effect.gen(function* () {
      const file = yield* writeCsv(validCsv);
      const result = yield* runImporter(["--file", file, "--apply"], unreachableDatabase);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(
        /^Database connection failed: .+\. No commit was confirmed; check the target database before running --apply again\.\n$/u,
      );
      expect(result.stderr).not.toContain("secret");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
