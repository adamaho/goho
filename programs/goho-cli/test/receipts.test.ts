import { describe, expect, it } from "vitest";

import { runCommand, withJsonResponse } from "./cli.ts";

const runList = (baseUrl: string) => runCommand(baseUrl, ["receipts", "list"]);

const runView = (receiptId: string, baseUrl: string) =>
  runCommand(baseUrl, ["receipts", "view", receiptId]);

const receipt = {
  id: "42",
  storeName: "Example Store",
  receiptDate: "2026-09-01",
  category: "Groceries",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: null,
  items: [{ position: 0, name: "Apples", amount: "11" }],
};

describe("receipts list", () => {
  it("prints the unwrapped receipt array", async () => {
    const receipts = [receipt];
    const result = await withJsonResponse(200, { data: receipts }, runList);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(receipts, null, 2)}\n`,
    });
  });

  it("prints an empty unwrapped array", async () => {
    const result = await withJsonResponse(200, { data: [] }, runList);
    expect(result).toEqual({ code: 0, stderr: "", stdout: "[]\n" });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, { _tag: "InternalServerError" }, runList);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Receipts could not be listed. Check the server logs and try again.\n",
    );
  });
});

describe("receipts view", () => {
  it("prints one unwrapped receipt", async () => {
    const result = await withJsonResponse(200, { data: receipt }, (baseUrl) =>
      runView(receipt.id, baseUrl),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(receipt, null, 2)}\n`,
    });
  });

  it("reports a missing receipt and exits nonzero", async () => {
    const result = await withJsonResponse(404, { _tag: "NotFound" }, (baseUrl) =>
      runView(receipt.id, baseUrl),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Receipt ${receipt.id} was not found.\n`);
  });

  it("does not retain the old show command", async () => {
    const result = await withJsonResponse(200, { data: receipt }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "show", receipt.id]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/view\s+View one persisted receipt\./);
    expect(result.stdout).not.toMatch(/show\s+/);
  });
});

describe("receipts process", () => {
  it("does not retain the legacy process command", async () => {
    const result = await withJsonResponse(200, { data: [] }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "process", "root", "sheet"]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).not.toMatch(/^  process\s/m);
  });
});
