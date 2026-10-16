import { Result } from "effect";
import { describe, expect, it } from "vitest";

import { parsePurchaseDate, planImport } from "#src/plan.ts";

import { rawCsv } from "./support/cli.ts";

const planned = (...rows: ReadonlyArray<string>) => {
  const result = planImport(rawCsv(...rows));
  if (Result.isFailure(result)) throw new Error(result.failure.message);
  return result.success;
};

const summary = (plan: ReturnType<typeof planned>) =>
  plan.receipts.map((receipt) => ({
    store: receipt.storeName,
    date: receipt.receiptDate,
    category: receipt.category,
    items: receipt.items.map((item) => `${item.name}=${item.amount}@${item.ref.record}`),
  }));

describe("receipt grouping", () => {
  it("merges store spellings on one date across noncontiguous rows and splits other dates", () => {
    const plan = planned(
      "  Metro   Plaza ,2024-12-31,Grocery,Milk,1.00,file-1",
      "Costco,2024-12-31,Grocery,Soap,4.00,file-1",
      "METRO PLAZA,2024-12-31,Grocery,Eggs,2.00,file-2",
      "metro\tplaza,2025-01-01,Grocery,Bread,3.00,file-1",
      "Metro Plaza,2024-12-31,Grocery,Jam,5.00,",
    );
    expect(summary(plan)).toEqual([
      {
        store: "Metro Plaza",
        date: "2024-12-31",
        category: "Grocery",
        items: ["Milk=1.00@2", "Eggs=2.00@4", "Jam=5.00@6"],
      },
      { store: "Costco", date: "2024-12-31", category: "Grocery", items: ["Soap=4.00@3"] },
      { store: "metro plaza", date: "2025-01-01", category: "Grocery", items: ["Bread=3.00@5"] },
    ]);
  });

  it("assigns CAD to every receipt", () => {
    const plan = planned("Metro,2024-12-31,Grocery,Milk,1.00,", "Costco,2024-12-31,Bulk,Soap,4,");
    expect(plan.receipts.map((receipt) => receipt.currency)).toEqual(["CAD", "CAD"]);
  });
});

describe("category selection", () => {
  it("chooses the category on the most retained rows", () => {
    const plan = planned(
      "Metro,2024-12-31,Household,Soap,1.00,",
      "Metro,2024-12-31, Grocery ,Milk,1.00,",
      "Metro,2024-12-31,Grocery,Eggs,1.00,",
    );
    expect(plan.receipts[0]?.category).toBe("Grocery");
  });

  it("breaks ties by the earliest retained occurrence", () => {
    const plan = planned(
      "Metro,2024-12-31,Household,Soap,1.00,",
      "Metro,2024-12-31,Grocery,Milk,1.00,",
    );
    expect(plan.receipts[0]?.category).toBe("Household");
  });

  it("ignores categories on excluded negative rows", () => {
    const plan = planned(
      "Metro,2024-12-31,Grocery,Refund,-1.00,",
      "Metro,2024-12-31,Grocery,Refund,-2.00,",
      "Metro,2024-12-31,Household,Soap,1.00,",
      "Metro,2024-12-31,Grocery,Milk,1.00,",
    );
    expect(plan.receipts[0]?.category).toBe("Household");
  });
});

describe("negative prices and item order", () => {
  it("keeps repeated and zero-price items in CSV order and reports negatives", () => {
    const plan = planned(
      "Metro,2024-12-31,Grocery,Apple,0.50,",
      "Metro,2024-12-31,Grocery,Refund,-1.00,",
      "Metro,2024-12-31,Grocery,Free bag,0,",
      "Metro,2024-12-31,Grocery,Apple,0.50,",
      "Metro,2024-12-31,Grocery,Zero,-0.00,",
    );
    expect(summary(plan)[0]?.items).toEqual([
      "Apple=0.50@2",
      "Free bag=0@4",
      "Apple=0.50@5",
      "Zero=0.00@6",
    ]);
    expect(plan.receipts[0]).toMatchObject({ subtotal: "1.00", tax: "0.13", total: "1.13" });
    expect(plan.skipped).toEqual([
      {
        ref: { record: 3, firstLine: 3, lastLine: 3 },
        store: "Metro",
        receiptDate: "2024-12-31",
        item: "Refund",
        price: "-1.00",
      },
    ]);
    expect(plan.errors).toEqual([]);
  });

  it("creates no receipt for a group whose rows are all negative", () => {
    const plan = planned(
      "Metro,2024-12-31,Grocery,Refund,-1.00,",
      "Metro,2024-12-31,Grocery,Refund,-2.50,",
      "Costco,2024-12-31,Grocery,Milk,1.00,",
    );
    expect(plan.receipts.map((receipt) => receipt.storeName)).toEqual(["Costco"]);
    expect(plan.skipped.map((skipped) => skipped.ref.record)).toEqual([2, 3]);
  });
});

describe("purchase dates", () => {
  it("resolves ISO dates and Google Sheets serials to the same historical date", () => {
    expect(parsePurchaseDate("2024-12-31")).toEqual(Result.succeed("2024-12-31"));
    expect(parsePurchaseDate("45657")).toEqual(Result.succeed("2024-12-31"));
    expect(parsePurchaseDate(" 2011-10-26 ")).toEqual(Result.succeed("2011-10-26"));
    expect(parsePurchaseDate("2024-02-29")).toEqual(Result.succeed("2024-02-29"));
    expect(parsePurchaseDate("1")).toEqual(Result.succeed("1899-12-31"));

    const plan = planned("Metro,2024-12-31,Grocery,Milk,1.00,", "Metro,45657,Grocery,Eggs,2.00,");
    expect(plan.receipts).toHaveLength(1);
    expect(plan.receipts[0]?.receiptDate).toBe("2024-12-31");
  });

  it("rejects impossible, ambiguous, and unsupported dates", () => {
    expect(parsePurchaseDate("2023-02-29")).toEqual(
      Result.fail('date "2023-02-29" is not a real calendar date'),
    );
    expect(parsePurchaseDate("2024-13-01")).toEqual(
      Result.fail('date "2024-13-01" is not a real calendar date'),
    );
    expect(parsePurchaseDate("01/02/2024")).toEqual(
      Result.fail('date "01/02/2024" is ambiguous; use YYYY-MM-DD'),
    );
    for (const value of ["45657.5", "Dec 31 2024", "2024-1-5", "-5"]) {
      expect(parsePurchaseDate(value)).toEqual(
        Result.fail(
          `date ${JSON.stringify(value)} must be YYYY-MM-DD or a whole Google Sheets date number`,
        ),
      );
    }
    expect(parsePurchaseDate("9999999")).toEqual(
      Result.fail("date serial 9999999 is outside the supported calendar range"),
    );
    expect(parsePurchaseDate("")).toEqual(Result.fail("date is required"));
  });
});

describe("validation", () => {
  it("collects every error across parseable records and keeps valid previews", () => {
    const plan = planned(
      "Metro,2024-12-31,Grocery,Milk,1.00,",
      " ,01/02/2024,,  ,$5.00,",
      "Metro,2023-02-29,Grocery,Eggs,1.00,",
      'Metro,2024-12-31,Grocery,Bread,"1,000.00",',
      "Metro,2024-12-31,Grocery,Jam,abc,,",
      "Metro,2024-12-31,Grocery,Tea,,",
    );
    expect(plan.errors.map((error) => `${error.ref.record}: ${error.message}`)).toEqual([
      "3: store is required",
      '3: date "01/02/2024" is ambiguous; use YYYY-MM-DD',
      "3: category is required",
      "3: item is required",
      '3: price "$5.00" is not a plain decimal such as 12.34 (no currency symbols, thousands separators, or plus signs)',
      '4: date "2023-02-29" is not a real calendar date',
      '5: price "1,000.00" is not a plain decimal such as 12.34 (no currency symbols, thousands separators, or plus signs)',
      "6: expected 6 fields but found 7",
      "7: price is required",
    ]);
    expect(summary(plan)[0]?.items).toEqual(["Milk=1.00@2"]);
  });
});
