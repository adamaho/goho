import { ReceiptNotFound, ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  errorOutput,
  runCommand,
  toTestResponse,
  withJsonResponse,
  withResponse,
} from "#test/cli.ts";

const runList = (baseUrl: string) => runCommand(baseUrl, ["receipts", "list"]);

const runView = (receiptId: string, baseUrl: string) =>
  runCommand(baseUrl, ["receipts", "view", receiptId]);

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
  receiptDate: "2026-09-01",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: "CAD",
  categories: [groceries],
  items: [{ id: "7", position: 0, name: "Apples", amount: "11", category: groceries }],
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
    const result = await withJsonResponse(500, new ReceiptsUnavailable(), runList);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Receipts could not be listed. Check the server logs and try again.",
      ),
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
    const result = await withJsonResponse(404, new ReceiptNotFound(), (baseUrl) =>
      runView(receipt.id, baseUrl),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(errorOutput("not_found", `Receipt ${receipt.id} was not found.`));
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

describe("receipts delete", () => {
  const runDelete = (status: number, body: unknown) =>
    withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("DELETE");
        expect(request.url).toBe(`/receipts/${receipt.id}`);
        return body === undefined
          ? HttpServerResponse.empty({ status })
          : yield* toTestResponse(status, body);
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "delete", receipt.id]),
    );

  it("deletes one receipt and confirms it", async () => {
    const result = await runDelete(204, undefined);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ deleted: true, resource: "receipt", id: receipt.id }, null, 2)}\n`,
    });
  });

  it("reports a missing receipt and exits nonzero", async () => {
    const result = await runDelete(404, new ReceiptNotFound());
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(errorOutput("not_found", `Receipt ${receipt.id} was not found.`));
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await runDelete(500, new ReceiptsUnavailable());
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Receipt could not be deleted. Check the server logs and try again.",
      ),
    );
  });

  it("rejects a malformed receipt ID and exits nonzero", async () => {
    const result = await withJsonResponse(500, {}, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "delete", "0"]),
    );
    expect(result.code).toBe(1);
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
