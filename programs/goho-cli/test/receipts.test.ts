import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Path, Stream } from "effect";
import { HttpServer, HttpServerResponse } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";
import { describe, expect, it } from "vitest";

interface CliResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const runCommand = (baseUrl: string, args: ReadonlyArray<string>): Promise<CliResult> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../src/main.ts", import.meta.url));
    const child = yield* ChildProcess.make(process.execPath, [mainPath, ...args], {
      env: { GOHO_SERVER_URL: baseUrl },
      extendEnv: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    return yield* Effect.all(
      {
        code: child.exitCode,
        stderr: child.stderr.pipe(Stream.decodeText(), Stream.mkString),
        stdout: child.stdout.pipe(Stream.decodeText(), Stream.mkString),
      },
      { concurrency: "unbounded" },
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

const runList = (baseUrl: string): Promise<CliResult> => runCommand(baseUrl, ["receipts", "list"]);

const runShow = (receiptId: string, baseUrl: string): Promise<CliResult> =>
  runCommand(baseUrl, ["receipts", "show", receiptId]);

const withJsonResponse = async <A>(
  status: number,
  body: unknown,
  run: (baseUrl: string) => Promise<A>,
): Promise<A> => {
  const ServerLive = HttpServer.serve(
    Effect.succeed(HttpServerResponse.jsonUnsafe(body, { status })),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    return yield* Effect.tryPromise(() => run(HttpServer.formatAddress(server.address))).pipe(
      Effect.orDie,
    );
  }).pipe(Effect.provide(ServerLive), Effect.scoped, Effect.runPromise);
};

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
