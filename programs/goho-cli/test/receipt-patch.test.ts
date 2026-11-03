import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { runCommand, withResponse } from "./cli.ts";

const groceries = {
  id: "3",
  name: "groceries",
  icon: "groceries",
  color: "green",
  kinds: ["receipt"],
};
const snacks = { id: "9", name: "snacks", icon: "other", color: "grey", kinds: ["receipt"] };
const item = {
  id: "9007199254740993",
  position: 0,
  name: "Apples",
  amount: "11",
  category: groceries,
};
const receipt = {
  id: "42",
  storeName: "Example Store",
  receiptDate: "2026-09-01",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: "CAD",
  categories: [groceries],
  items: [item],
};

const runPatch = (
  args: ReadonlyArray<string>,
  url: string,
  payload: unknown,
  status: number,
  body: unknown,
) =>
  withResponse(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      expect(request.method).toBe("PATCH");
      expect(request.url).toBe(url);
      expect(yield* request.json.pipe(Effect.orDie)).toEqual(payload);
      return status === 400
        ? HttpServerResponse.empty({ status })
        : HttpServerResponse.jsonUnsafe(body, { status });
    }),
    (baseUrl) => runCommand(baseUrl, ["receipts", ...args]),
  );

describe("receipts patch", () => {
  it.each([
    { flags: ["--store-name", "  Corner Store  "], changes: { storeName: "Corner Store" } },
    { flags: ["--receipt-date", "2024-02-29"], changes: { receiptDate: "2024-02-29" } },
    {
      flags: ["--store-name", "Corner Store", "--receipt-date", "2026-10-17"],
      changes: { storeName: "Corner Store", receiptDate: "2026-10-17" },
    },
  ])(
    "sends only supplied fields and prints the saved receipt: $changes",
    async ({ flags, changes }) => {
      const saved = { ...receipt, ...changes };
      const result = await runPatch(
        ["patch", receipt.id, ...flags],
        `/receipts/${receipt.id}`,
        changes,
        200,
        { data: saved },
      );
      expect(result).toEqual({
        code: 0,
        stderr: "",
        stdout: `${JSON.stringify(saved, null, 2)}\n`,
      });
    },
  );

  it.each([
    {
      status: 400,
      tag: "BadRequest",
      message: "The receipt correction was rejected. Check the supplied changes.",
    },
    { status: 404, tag: "NotFound", message: "Receipt 42 was not found." },
    {
      status: 500,
      tag: "InternalServerError",
      message: "Receipt could not be patched. Check the server logs and try again.",
    },
  ])("reports HTTP $status and exits nonzero", async ({ status, tag, message }) => {
    const result = await runPatch(
      ["patch", receipt.id, "--store-name", "Corner Store"],
      `/receipts/${receipt.id}`,
      { storeName: "Corner Store" },
      status,
      { _tag: tag },
    );
    expect(result).toEqual({ code: 1, stdout: "", stderr: `${message}\n` });
  });
});

describe("receipts patch-item", () => {
  it.each([
    {
      flags: ["--name", "  Granny Smith apples  "],
      changes: { name: "Granny Smith apples" },
      saved: { name: "Granny Smith apples" },
    },
    {
      flags: ["--category", "  Snacks  "],
      changes: { category: "Snacks" },
      saved: { category: snacks },
    },
    {
      flags: ["--name", "Chips", "--category", "Snacks"],
      changes: { name: "Chips", category: "Snacks" },
      saved: { name: "Chips", category: snacks },
    },
  ])(
    "uses the exact persisted item ID, sends trimmed supplied fields, and prints the saved item: $changes",
    async ({ flags, changes, saved }) => {
      const result = await runPatch(
        ["patch-item", receipt.id, item.id, ...flags],
        `/receipts/${receipt.id}/items/${item.id}`,
        changes,
        200,
        { data: { ...item, ...saved } },
      );
      expect(result).toEqual({
        code: 0,
        stderr: "",
        stdout: `${JSON.stringify({ ...item, ...saved }, null, 2)}\n`,
      });
    },
  );

  it.each([
    {
      status: 400,
      tag: "BadRequest",
      message: "The item correction was rejected. Check the supplied changes.",
    },
    { status: 404, tag: "NotFound", message: `Item ${item.id} was not found on receipt 42.` },
    {
      status: 500,
      tag: "InternalServerError",
      message: "Receipt item could not be patched. Check the server logs and try again.",
    },
  ])("reports HTTP $status and exits nonzero", async ({ status, tag, message }) => {
    const result = await runPatch(
      ["patch-item", receipt.id, item.id, "--name", "Apples"],
      `/receipts/${receipt.id}/items/${item.id}`,
      { name: "Apples" },
      status,
      { _tag: tag },
    );
    expect(result).toEqual({ code: 1, stdout: "", stderr: `${message}\n` });
  });
});

describe("receipt patch validation", () => {
  it.each([
    ["patch", "42"],
    ["patch", "42", "--store-name", "   "],
    ["patch", "42", "--receipt-date", "2026-02-29"],
    ["patch", "42", "--receipt-date", "10/17/2026"],
    ["patch", "0", "--store-name", "Corner Store"],
    ["patch", "42", "--total", "12"],
    ["patch", "42", "--store-name", "Corner Store", "--currency", "USD"],
    // Categories belong to items now.
    ["patch", "42", "--category", "Snacks"],
    ["patch-item", "42", "7"],
    ["patch-item", "42", "7", "--name", "  "],
    ["patch-item", "42", "7", "--category", ""],
    ["patch-item", "42", "7", "--name", "Apples", "--category", " "],
    ["patch-item", "0", "7", "--name", "Apples"],
    ["patch-item", "42", "0", "--name", "Apples"],
    ["patch-item", "42", "01", "--name", "Apples"],
    ["patch-item", "42", "9223372036854775808", "--name", "Apples"],
    ["patch-item", "42", "7", "--name", "Apples", "--amount", "12"],
  ])("rejects invalid arguments before sending a request: %j", async (...args) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.jsonUnsafe({ data: receipt });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", ...args]),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout + result.stderr).not.toBe("");
  });
});
