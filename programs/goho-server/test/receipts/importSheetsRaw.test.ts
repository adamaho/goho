import { it } from "@effect/vitest";
import { GoogleSheets } from "@goho/core";
import { Effect, Layer, Schema } from "effect";
import { expect } from "vitest";

import { importTaxTotals, mapRawRows, run } from "../../src/receipts/importSheetsRaw.ts";
import { ParsedReceipt, ReceiptId } from "../../src/receipts/model.ts";
import * as Repository from "../../src/receipts/repository.ts";
import { parsedReceipt } from "./fixtures.ts";

const header = ["store", "date", "category", "item", "price", "source_file_id"] as const;

it("groups real source_file_id rows into one google_drive receipt", () => {
  const mapped = mapRawRows("sheet-1", [
    header,
    ["Costco", "2026-01-02", "Groceries", "Milk", 3.5, "drive-file-1"],
    ["Other Store", "2026-02-03", "Other", "Bread", 2, "drive-file-1"],
  ]);
  expect(mapped.rejects).toEqual([]);
  expect(mapped.receipts).toHaveLength(1);
  const receipt = mapped.receipts[0];
  expect(receipt?.source).toEqual({
    provider: "google_drive",
    fileId: "drive-file-1",
    fileName: "drive-file-1",
  });
  expect(receipt?.storeName).toBe("Costco");
  expect(receipt?.receiptDate).toBe("2026-01-02");
  expect(receipt?.category).toBe("Groceries");
  expect(receipt?.items).toEqual([
    { position: 0, name: "Milk", amount: "3.5" },
    { position: 1, name: "Bread", amount: "2" },
  ]);
  expect(receipt?.extractedPayload).toMatchObject({ importedFrom: "google_sheets_raw" });
});

it("merges every blank-F row with the same store and date, not only a contiguous block", () => {
  const mapped = mapRawRows("sheet-1", [
    header,
    ["Costco", "2024-06-01", "Groceries", "Milk", 3, ""],
    ["Walmart", "2024-06-01", "Groceries", "Other", 1, ""],
    ["Costco", "2024-06-01", "Pharmacy", "Eggs", 4, ""],
  ]);
  expect(mapped.rejects).toEqual([]);
  expect(mapped.receipts).toHaveLength(2);
  const costco = mapped.receipts.find((receipt) => receipt.storeName === "Costco");
  expect(costco?.source).toEqual({
    provider: "google_sheets",
    fileId: "sheet:sheet-1:Costco:2024-06-01",
    fileName: "sheet:sheet-1:Costco:2024-06-01",
  });
  expect(costco?.category).toBe("Groceries");
  expect(costco?.items).toEqual([
    { position: 0, name: "Milk", amount: "3" },
    { position: 1, name: "Eggs", amount: "4" },
  ]);
});

it("keeps mixed real-F and blank-F rows with the same store and date as separate receipts", () => {
  const mapped = mapRawRows("sheet-1", [
    header,
    ["Costco", "2026-01-02", "Groceries", "Milk", 3, "drive-file-1"],
    ["Costco", "2026-01-02", "Groceries", "Eggs", 4, ""],
  ]);
  expect(mapped.receipts.map((receipt) => receipt.source.provider).sort()).toEqual([
    "google_drive",
    "google_sheets",
  ]);
  expect(mapped.receipts.map((receipt) => receipt.source.fileId).sort()).toEqual([
    "drive-file-1",
    "sheet:sheet-1:Costco:2026-01-02",
  ]);
});

it("rounds import-only totals as subtotal × 1.13 half-up to 2 decimals", () => {
  expect(importTaxTotals([10])).toMatchObject({
    subtotal: "10",
    total: "11.30",
    tax: "1.30",
  });
  expect(importTaxTotals([1.15])).toMatchObject({
    subtotal: "1.15",
    total: "1.30",
    tax: "0.15",
  });
  expect(importTaxTotals([2.22])).toMatchObject({
    subtotal: "2.22",
    total: "2.51",
    tax: "0.29",
  });
  const mapped = mapRawRows("sheet-1", [
    header,
    ["Costco", "2026-01-02", "Groceries", "Milk", 10, ""],
  ]);
  expect(mapped.receipts[0]).toMatchObject({
    subtotal: "10",
    total: "11.30",
    tax: "1.30",
  });
});

it("imports calendar dates before 2025 on the mapper path only", () => {
  const mapped = mapRawRows("sheet-1", [
    header,
    ["Costco", "2024-12-31", "Groceries", "Milk", 3, ""],
  ]);
  expect(mapped.rejects).toEqual([]);
  expect(mapped.receipts[0]?.receiptDate).toBe("2024-12-31");
});

it("rejects empty or invalid store, date, category, item, and price without inventing values", () => {
  const mapped = mapRawRows("sheet-1", [
    header,
    ["", "2026-01-02", "Groceries", "Milk", 3, ""],
    ["Costco", "not-a-date", "Groceries", "Milk", 3, ""],
    ["Costco", "2026-01-02", "", "Milk", 3, ""],
    ["Costco", "2026-01-02", "Groceries", "", 3, ""],
    ["Costco", "2026-01-02", "Groceries", "Milk", "N/A", ""],
    ["Costco", "2026-13-40", "Groceries", "Milk", 3, ""],
  ]);
  expect(mapped.receipts).toEqual([]);
  expect(mapped.rejects).toEqual([
    { row: 2, reason: "invalid store" },
    { row: 3, reason: "invalid date" },
    { row: 4, reason: "invalid category" },
    { row: 5, reason: "invalid item" },
    { row: 6, reason: "invalid price" },
    { row: 7, reason: "invalid date" },
  ]);
});

it.effect("keeps the live ParsedReceipt date rule at 2025 or later", () =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeEffect(ParsedReceipt)({
      ...parsedReceipt,
      date: "2024-12-31",
    }).pipe(Effect.result);
    expect(decoded._tag).toBe("Failure");
  }),
);

it.effect("dry-run maps receipt counts and sample ids without writing", () =>
  Effect.gen(function* () {
    const result = yield* run({ spreadsheetId: "sheet-1", worksheet: "RAW", apply: false });
    expect(result).toEqual({
      apply: false,
      receiptCount: 1,
      sampleSourceIds: ["drive-file-1"],
      imported: 0,
      skippedAlreadyPresent: 0,
      skippedInvalid: 1,
      rejects: [{ row: 3, reason: "invalid store" }],
    });
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(GoogleSheets.Service, {
          readRows: () =>
            Effect.succeed([
              header,
              ["Costco", "2026-01-02", "Groceries", "Milk", 3, "drive-file-1"],
              ["", "2026-01-02", "Groceries", "Milk", 3, ""],
            ]),
          appendRows: () =>
            Effect.fail(
              new GoogleSheets.SheetsError({ operation: "appendRows", message: "unused" }),
            ),
        }),
        Layer.succeed(Repository.Service, {
          save: () =>
            Effect.succeed({
              _tag: "AlreadyExists",
              receiptId: ReceiptId.make("00000000-0000-4000-8000-000000000001"),
            }),
        }),
      ),
    ),
  ),
);
