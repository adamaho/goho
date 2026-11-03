import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { runCommand, withResponse } from "./cli.ts";

const payload = {
  storeName: "Example Store",
  receiptDate: "2026-09-13",
  subtotal: "10.25",
  tax: "0.75",
  total: "11.00",
  currency: "USD",
  items: [{ name: "Apples", amount: "10.25", category: "Groceries" }],
};
const groceries = {
  id: "3",
  name: "groceries",
  icon: "groceries",
  color: "green",
  kinds: ["receipt"],
};
const receipt = {
  id: "42",
  storeName: "Example Store",
  receiptDate: "2026-09-13",
  subtotal: "10.25",
  tax: "0.75",
  total: "11.00",
  currency: "USD",
  categories: [groceries],
  items: [{ id: "7", position: 0, name: "Apples", amount: "10.25", category: groceries }],
};

const flags = (overrides: Record<string, string> = {}) =>
  Object.entries({
    "--store-name": "Example Store",
    "--receipt-date": "2026-09-13",
    "--subtotal": "10.25",
    "--tax": "0.75",
    "--total": "11.00",
    "--currency": "USD",
    ...overrides,
  }).flat();

const apples = ["--item", "name=Apples,amount=10.25,category=Groceries"];

const runCreate = (args: ReadonlyArray<string>, expected: unknown, status: number, body: unknown) =>
  withResponse(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/receipts");
      expect(yield* request.json.pipe(Effect.orDie)).toEqual(expected);
      return status === 400
        ? HttpServerResponse.empty({ status })
        : HttpServerResponse.jsonUnsafe(body, { status });
    }),
    (baseUrl) => runCommand(baseUrl, ["receipts", "create", ...args]),
  );

describe("receipts create", () => {
  it("sends the receipt and prints the saved one", async () => {
    const result = await runCreate([...flags(), ...apples], payload, 200, { data: receipt });
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(receipt, null, 2)}\n`,
    });
  });

  it("keeps repeated items in order with their exact amounts", async () => {
    const result = await runCreate(
      [...flags(), ...apples, "--item", "name=Discount,amount=-1.50,category=Groceries"],
      {
        ...payload,
        items: [...payload.items, { name: "Discount", amount: "-1.50", category: "Groceries" }],
      },
      200,
      { data: receipt },
    );
    expect(result.code).toBe(0);
  });

  it.each([
    {
      item: "category=Groceries,amount=4.99,name=Milk",
      name: "Milk",
      why: "keys in any order",
    },
    {
      item: "name=Milk\\, 2%,amount=4.99,category=Groceries",
      name: "Milk, 2%",
      why: "an escaped comma",
    },
    {
      item: "name=C:\\\\temp\\, x,amount=4.99,category=Groceries",
      name: "C:\\temp, x",
      why: "an escaped backslash",
    },
    {
      item: "name=A=B,amount=4.99,category=Groceries",
      name: "A=B",
      why: "an equals sign in a value",
    },
    {
      item: "name=  Milk  ,amount=4.99,category=Groceries",
      name: "Milk",
      why: "padding around a name",
    },
  ])("reads an item with $why", async ({ item, name }) => {
    const result = await runCreate(
      [...flags(), "--item", item],
      { ...payload, items: [{ name, amount: "4.99", category: "Groceries" }] },
      200,
      { data: receipt },
    );
    expect(result.code).toBe(0);
  });

  it("accepts negative totals", async () => {
    const result = await runCreate(
      [...flags({ "--total": "-1.50" }), ...apples],
      { ...payload, total: "-1.50" },
      200,
      { data: receipt },
    );
    expect(result.code).toBe(0);
  });

  it.each([
    {
      status: 400,
      tag: "BadRequest",
      message: "The receipt was rejected. Check the supplied values.",
    },
    {
      status: 500,
      tag: "InternalServerError",
      message: "Receipt could not be created. Check the server logs and try again.",
    },
  ])("reports HTTP $status and exits nonzero", async ({ status, tag, message }) => {
    const result = await runCreate([...flags(), ...apples], payload, status, { _tag: tag });
    expect(result).toEqual({ code: 1, stdout: "", stderr: `${message}\n` });
  });
});

describe("receipt create validation", () => {
  const countRequests = async (args: ReadonlyArray<string>) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.jsonUnsafe({ data: receipt });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "create", ...args]),
    );
    return { requests, result };
  };

  it.each([
    { why: "no flags", args: [] },
    { why: "no items", args: flags() },
    { why: "a missing field", args: ["--store-name", "Example Store", ...apples] },
    { why: "a blank store name", args: [...flags({ "--store-name": "  " }), ...apples] },
    { why: "an impossible date", args: [...flags({ "--receipt-date": "2026-02-30" }), ...apples] },
    { why: "a non-decimal total", args: [...flags({ "--total": "lots" }), ...apples] },
    { why: "a lowercase currency", args: [...flags({ "--currency": "usd" }), ...apples] },
    { why: "an unknown flag", args: [...flags(), ...apples, "--tip", "1"] },
  ])("rejects $why before sending a request", async ({ args }) => {
    const { requests, result } = await countRequests(args);
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout + result.stderr).not.toBe("");
  });

  it.each([
    {
      why: "an unescaped comma",
      item: "name=Milk, 2%,amount=4.99,category=Groceries",
      problem: '" 2%" is not a key=value pair',
    },
    {
      why: "an unknown key",
      item: "name=Milk,amount=4.99,category=Groceries,qty=2",
      problem: '"qty" is not a known key',
    },
    {
      why: "a repeated key",
      item: "name=Milk,name=Eggs,amount=4.99,category=Groceries",
      problem: '"name" appears more than once',
    },
    {
      why: "missing keys",
      item: "name=Milk",
      problem: "missing amount, category",
    },
  ])("rejects $why in an item before sending a request", async ({ item, problem }) => {
    const { requests, result } = await countRequests([...flags(), "--item", item]);
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`Invalid --item "${item}": ${problem}.`);
  });

  it.each([
    { why: "a blank name", item: "name= ,amount=4.99,category=Groceries", at: "name" },
    {
      why: "a non-decimal amount",
      item: "name=Milk,amount=cheap,category=Groceries",
      at: "amount",
    },
    { why: "a blank category", item: "name=Milk,amount=4.99,category=", at: "category" },
  ])("names the field for $why in an item", async ({ item, at }) => {
    const { requests, result } = await countRequests([...flags(), ...apples, "--item", item]);
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Receipt is not valid: ");
    expect(result.stderr).toContain(`["items"][1]["${at}"]`);
  });
});
