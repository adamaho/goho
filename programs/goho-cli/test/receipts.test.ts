import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mainPath = fileURLToPath(new URL("../src/main.ts", import.meta.url));

interface CliResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const runCommand = (baseUrl: string, args: ReadonlyArray<string>): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mainPath, ...args], {
      env: { ...process.env, GOHO_SERVER_URL: baseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stderr, stdout }));
  });

const runList = (baseUrl: string): Promise<CliResult> =>
  runCommand(baseUrl, ["receipts", "list"]);

const runShow = (receiptId: string, baseUrl: string): Promise<CliResult> =>
  runCommand(baseUrl, ["receipts", "show", receiptId]);

const withJsonResponse = async <A>(
  status: number,
  body: unknown,
  run: (baseUrl: string) => Promise<A>,
): Promise<A> => {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
};

const receipt = {
  id: "01994ac0-dc00-7d9d-8d70-a50dfdad9c11",
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

describe("receipts show", () => {
  it("prints one unwrapped receipt", async () => {
    const result = await withJsonResponse(200, { data: receipt }, (baseUrl) =>
      runShow(receipt.id, baseUrl),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(receipt, null, 2)}\n`,
    });
  });

  it("reports a missing receipt and exits nonzero", async () => {
    const result = await withJsonResponse(404, { _tag: "NotFound" }, (baseUrl) =>
      runShow(receipt.id, baseUrl),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Receipt ${receipt.id} was not found.\n`);
  });
});
