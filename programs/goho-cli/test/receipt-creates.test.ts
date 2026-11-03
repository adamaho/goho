import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { runCommand, withResponse } from "./cli.ts";

const input = {
  storeName: "Example Store",
  receiptDate: "2026-09-13",
  subtotal: "10.25",
  tax: "0.75",
  total: "11.00",
  currency: "USD",
  items: [
    { name: "Apples", amount: "10.25", category: "Groceries" },
    { name: "Discount", amount: "-1.50", category: "Groceries" },
  ],
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
  items: [
    { id: "7", position: 0, name: "Apples", amount: "10.25", category: groceries },
    { id: "8", position: 1, name: "Discount", amount: "-1.50", category: groceries },
  ],
};

const withReceiptFile = <A>(contents: string, run: (filePath: string) => Promise<A>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "goho-cli-test-" });
    const filePath = path.join(directory, "receipt.json");
    yield* fileSystem.writeFileString(filePath, contents);
    return yield* Effect.tryPromise(() => run(filePath)).pipe(Effect.orDie);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

const runCreate = (contents: unknown, payload: unknown, status: number, body: unknown) =>
  withReceiptFile(JSON.stringify(contents), (filePath) =>
    withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/receipts");
        expect(yield* request.json.pipe(Effect.orDie)).toEqual(payload);
        return status === 400
          ? HttpServerResponse.empty({ status })
          : HttpServerResponse.jsonUnsafe(body, { status });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "create", filePath]),
    ),
  );

describe("receipts create", () => {
  it("sends the receipt with its exact amounts and item order and prints it", async () => {
    const result = await runCreate(input, input, 200, { data: receipt });
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(receipt, null, 2)}\n`,
    });
  });

  it("trims store and item names before sending", async () => {
    const result = await runCreate(
      {
        ...input,
        storeName: "  Example Store  ",
        items: [{ name: " Apples ", amount: "10.25", category: " Groceries " }],
      },
      {
        ...input,
        items: [{ name: "Apples", amount: "10.25", category: "Groceries" }],
      },
      200,
      { data: receipt },
    );
    expect(result.code).toBe(0);
  });

  it.each([
    {
      status: 400,
      tag: "BadRequest",
      message: "The receipt was rejected. Check the file's values.",
    },
    {
      status: 500,
      tag: "InternalServerError",
      message: "Receipt could not be created. Check the server logs and try again.",
    },
  ])("reports HTTP $status and exits nonzero", async ({ status, tag, message }) => {
    const result = await runCreate(input, input, status, { _tag: tag });
    expect(result).toEqual({ code: 1, stdout: "", stderr: `${message}\n` });
  });
});

describe("receipt create validation", () => {
  it.each([
    { name: "malformed JSON", contents: "{" },
    { name: "a non-object", contents: "[]" },
    { name: "a missing field", contents: JSON.stringify({ ...input, total: undefined }) },
    { name: "no items", contents: JSON.stringify({ ...input, items: [] }) },
    { name: "a blank store name", contents: JSON.stringify({ ...input, storeName: "  " }) },
    {
      name: "an impossible date",
      contents: JSON.stringify({ ...input, receiptDate: "2026-02-30" }),
    },
    { name: "a numeric amount", contents: JSON.stringify({ ...input, total: 11 }) },
    { name: "a lowercase currency", contents: JSON.stringify({ ...input, currency: "usd" }) },
    { name: "an unknown field", contents: JSON.stringify({ ...input, totl: "11.00" }) },
    {
      name: "an unknown item field",
      contents: JSON.stringify({
        ...input,
        items: [{ name: "Apples", amount: "10.25", category: "Groceries", qty: 1 }],
      }),
    },
  ])("rejects $name before sending a request", async ({ contents }) => {
    let requests = 0;
    const result = await withReceiptFile(contents, (filePath) =>
      withResponse(
        Effect.sync(() => {
          requests += 1;
          return HttpServerResponse.jsonUnsafe({ data: receipt });
        }),
        (baseUrl) => runCommand(baseUrl, ["receipts", "create", filePath]),
      ),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^Receipt file is not a valid receipt: /u);
  });

  it("reports an unreadable path before sending a request", async () => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.jsonUnsafe({ data: receipt });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "create", "/missing/receipt.json"]),
    );
    expect(requests).toBe(0);
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Receipt file could not be read: /missing/receipt.json\n",
    });
  });
});
