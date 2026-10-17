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

  it("rejects empty files and missing or wrong headers", () => {
    expect(failure("")._tag).toBe("RawCsvImporter.InvalidHeader");
    expect(failure("Metro,2024-12-31,Grocery,Milk,1.00,")).toMatchObject({
      _tag: "RawCsvImporter.InvalidHeader",
      message:
        "CSV header must be store,date,category,item,price,source_file_id but was Metro,2024-12-31,Grocery,Milk,1.00,",
    });
    expect(failure("store,date,category,item,price\nMetro,2024-12-31,Grocery,Milk,1.00")._tag).toBe(
      "RawCsvImporter.InvalidHeader",
    );
    expect(failure("date,store,category,item,price,source_file_id")._tag).toBe(
      "RawCsvImporter.InvalidHeader",
    );
  });

  it("rejects a header quoted into one field even though its text lists every column", () => {
    expect(
      failure(
        '"store,date,category,item,price,source_file_id"\nMetro,2024-12-31,Groceries,Milk,1.50,',
      ),
    ).toMatchObject({
      _tag: "RawCsvImporter.InvalidHeader",
      message:
        'CSV header must have 6 fields (store,date,category,item,price,source_file_id) but had 1: ["store,date,category,item,price,source_file_id"]',
    });
    expect(
      failure(
        'store,"date,category",item,price,source_file_id\nMetro,2024-12-31,Groceries,Milk,1.50,',
      )._tag,
    ).toBe("RawCsvImporter.InvalidHeader");
  });

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
