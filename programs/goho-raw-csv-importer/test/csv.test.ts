import { Result } from "effect";
import { describe, expect, it } from "vitest";

import { parseRecords } from "#src/csv.ts";
import { planImport } from "#src/plan.ts";

import { rawCsv } from "./support/cli.ts";

const planned = (text: string) => {
  const result = planImport(text);
  if (Result.isFailure(result)) throw new Error(result.failure.message);
  return result.success;
};

const failure = (text: string) => {
  const result = planImport(text);
  if (Result.isSuccess(result)) throw new Error("Expected the CSV to be rejected");
  return result.failure;
};

describe("CSV parsing", () => {
  it("handles quoted commas, escaped quotes, and multiline fields with source references", () => {
    const records = parseRecords(
      'a,b\n"Milk, 2%","He said ""hi"""\n"first\nsecond\nthird",x\nlast,row\n',
    );
    expect(Result.getOrThrow(records)).toEqual([
      { record: 1, firstLine: 1, lastLine: 1, fields: ["a", "b"] },
      { record: 2, firstLine: 2, lastLine: 2, fields: ["Milk, 2%", 'He said "hi"'] },
      { record: 3, firstLine: 3, lastLine: 5, fields: ["first\nsecond\nthird", "x"] },
      { record: 4, firstLine: 6, lastLine: 6, fields: ["last", "row"] },
    ]);
  });

  it("tracks lines in CRLF files, including quoted CRLF and LF breaks", () => {
    const records = parseRecords('a,b\r\n"one\r\ntwo",x\r\n\r\n"three\nfour",y\r\nlast,row');
    expect(Result.getOrThrow(records)).toEqual([
      { record: 1, firstLine: 1, lastLine: 1, fields: ["a", "b"] },
      { record: 2, firstLine: 2, lastLine: 3, fields: ["one\r\ntwo", "x"] },
      { record: 3, firstLine: 4, lastLine: 4, fields: [""] },
      { record: 4, firstLine: 5, lastLine: 6, fields: ["three\nfour", "y"] },
      { record: 5, firstLine: 7, lastLine: 7, fields: ["last", "row"] },
    ]);
  });

  it("strips a byte order mark from the header", () => {
    const plan = planned(`﻿${rawCsv("Metro,2024-12-31,Grocery,Milk,1.00,")}`);
    expect(plan.receipts).toHaveLength(1);
  });

  it("skips blank records while keeping later record numbers aligned with the source", () => {
    const plan = planned(
      rawCsv(
        "",
        ",,,,,",
        "   ,  , , ,\t, ",
        'Metro,2024-12-31,Grocery,"Bread\nloaf",2.00,',
        "Metro,2024-12-31,Grocery,Milk,1.00,",
      ),
    );
    expect(plan.blankRecords).toBe(3);
    expect(plan.dataRecords).toBe(5);
    expect(plan.errors).toEqual([]);
    expect(plan.receipts[0]?.items).toEqual([
      { ref: { record: 5, firstLine: 5, lastLine: 6 }, name: "Bread\nloaf", amount: "2.00" },
      { ref: { record: 6, firstLine: 7, lastLine: 7 }, name: "Milk", amount: "1.00" },
    ]);
  });

  it("ignores source_file_id values", () => {
    const plan = planned(
      rawCsv("Metro,2024-12-31,Grocery,Milk,1.00,file-a", "Metro,2024-12-31,Grocery,Eggs,2.00,"),
    );
    expect(plan.receipts).toHaveLength(1);
  });
});

describe("CSV header", () => {
  const expectedHeader =
    'expected exactly 6 columns in this order: store,date,category,item,price,source_file_id (names are trimmed and case-insensitive; "cost" may replace "price", as in Google Sheets RAW exports)';
  const row = "Metro,2024-12-31,Grocery,Milk,1.50,";

  it("accepts the Google Sheets RAW export header and reads Cost as the price", () => {
    const plan = planned(`Store,Date,Category,Item,Cost,source_file_id\n${row}`);
    expect(plan.errors).toEqual([]);
    expect(plan.receipts).toMatchObject([
      { subtotal: "1.50", tax: "0.20", total: "1.70", items: [{ name: "Milk", amount: "1.50" }] },
    ]);
  });

  it("keeps accepting the canonical header with trimmed, case-insensitive names", () => {
    for (const header of [
      "store,date,category,item,price,source_file_id",
      " STORE , Date,category ,ITEM, Price ,Source_File_ID",
      "store,date,category,item,COST,source_file_id",
    ]) {
      expect(planned(`${header}\n${row}`).receipts).toHaveLength(1);
    }
  });

  it("rejects empty files and headers with missing or extra columns", () => {
    expect(failure("")).toMatchObject({
      _tag: "RawCsvImporter.InvalidHeader",
      message: `CSV is empty; ${expectedHeader}`,
    });
    expect(failure(`Store,Date,Category,Item,Cost\n${row}`)).toMatchObject({
      _tag: "RawCsvImporter.InvalidHeader",
      message: `CSV header has 5 fields ["Store","Date","Category","Item","Cost"]; ${expectedHeader}`,
    });
    expect(failure(`Store,Date,Category,Item,Cost,source_file_id,Notes\n${row}`)._tag).toBe(
      "RawCsvImporter.InvalidHeader",
    );
  });

  it("rejects wrong, reordered, duplicated, and misplaced alias columns by position", () => {
    const cases = [
      ["Metro,2024-12-31,Grocery,Milk,1.00,", 1, "Metro", '"store"'],
      ["Store,Date,Category,Item,Amount,source_file_id", 5, "Amount", '"price" or "cost"'],
      ["Date,Store,Category,Item,Cost,source_file_id", 1, "Date", '"store"'],
      ["Store,Store,Category,Item,Cost,source_file_id", 2, "Store", '"date"'],
      ["Store,Date,Category,Item,Price,Cost", 6, "Cost", '"source_file_id"'],
      ["Store,Date,Category,Cost,Price,source_file_id", 4, "Cost", '"item"'],
      ["Store,Date,Category,Item,,source_file_id", 5, "", '"price" or "cost"'],
    ] as const;
    for (const [header, column, actual, allowed] of cases) {
      expect(failure(`${header}\n${row}`)).toMatchObject({
        _tag: "RawCsvImporter.InvalidHeader",
        message: `CSV header column ${column} is ${JSON.stringify(actual)} but must be ${allowed}; ${expectedHeader}`,
      });
    }
  });

  it("rejects a header quoted into one field even though its text lists every column", () => {
    for (const header of [
      '"store,date,category,item,price,source_file_id"',
      '"Store,Date,Category,Item,Cost,source_file_id"',
    ]) {
      expect(failure(`${header}\n${row}`)).toMatchObject({
        _tag: "RawCsvImporter.InvalidHeader",
        message: `CSV header has 1 field ${JSON.stringify([header.slice(1, -1)])}; ${expectedHeader}`,
      });
    }
    expect(failure(`store,"date,category",item,price,source_file_id\n${row}`)._tag).toBe(
      "RawCsvImporter.InvalidHeader",
    );
  });
});

describe("CSV parsing errors", () => {
  it("fails visibly on malformed quoting without claiming later records were validated", () => {
    const unclosed = failure(rawCsv('Metro,2024-12-31,Grocery,"Milk,1.00,', "Metro,bad,,,,"));
    expect(unclosed._tag).toBe("RawCsvImporter.MalformedCsv");
    expect(unclosed.message).toContain("Quote Not Closed");
    expect(unclosed.message).toContain("No records were validated after this point.");

    const badClose = failure(rawCsv('Metro,2024-12-31,Grocery,"Milk"x,1.00,'));
    expect(badClose._tag).toBe("RawCsvImporter.MalformedCsv");
    expect(badClose.message).toContain("Invalid Closing Quote");
  });

  it("reports records with the wrong field count and keeps validating the rest", () => {
    const plan = planned(
      rawCsv(
        "Metro,2024-12-31,Grocery,Milk,1.00",
        "Metro,2024-12-31,Grocery,Milk,1.00,,extra",
        "Metro,2024-12-31,Grocery,Eggs,2.00,",
      ),
    );
    expect(plan.errors).toEqual([
      { ref: { record: 2, firstLine: 2, lastLine: 2 }, message: "expected 6 fields but found 5" },
      { ref: { record: 3, firstLine: 3, lastLine: 3 }, message: "expected 6 fields but found 7" },
    ]);
    expect(plan.receipts.map((receipt) => receipt.items.map((item) => item.name))).toEqual([
      ["Eggs"],
    ]);
  });
});
