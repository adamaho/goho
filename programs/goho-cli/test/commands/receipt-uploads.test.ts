import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse, Multipart } from "effect/http";
import { describe, expect, it } from "vitest";

import { errorOutput, runCommand, withJsonResponse, withResponse } from "#test/cli.ts";

const uploadId = "00000000-0000-4000-8000-000000000001";
const upload = {
  id: uploadId,
  fileName: "receipt.png",
  contentType: "image/png",
  status: "queued",
  receiptId: null,
  failureCode: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
};

describe("receipts upload command structure", () => {
  const runWithoutRequest = async (args: ReadonlyArray<string>) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", ...args]),
    );
    expect(requests).toBe(0);
    return result;
  };

  it("shows upload operations without listing uploads when no subcommand is given", async () => {
    const result = await runWithoutRequest(["uploads"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("goho receipts uploads");
    for (const operation of ["create", "list", "view", "delete"]) {
      expect(result.stdout).toMatch(new RegExp(`^  ${operation}\\s`, "m"));
    }
  });

  it.each([
    ["upload", "scan.png"],
    ["status", uploadId],
    ["delete-upload", uploadId],
  ])("rejects the previous flat form: %j", async (...args) => {
    const result = await runWithoutRequest(args);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Unknown subcommand "${args[0]}"`);
  });

  it.each([["create"], ["view"], ["view", "not-a-uuid"], ["delete"]])(
    "requires arguments for uploads %j before sending a request",
    async (...args) => {
      const result = await runWithoutRequest(["uploads", ...args]);
      expect(result.code).toBe(1);
      expect(result.stdout + result.stderr).not.toBe("");
    },
  );
});

const withTempFile = <A>(
  fileName: string,
  bytes: Uint8Array,
  run: (filePath: string) => Promise<A>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "goho-cli-test-" });
    const filePath = path.join(directory, fileName);
    yield* fileSystem.writeFile(filePath, bytes);
    return yield* Effect.tryPromise(() => run(filePath)).pipe(Effect.orDie);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

describe("receipts uploads create", () => {
  it("uploads one image and prints its queued resource", async () => {
    let received:
      | {
          readonly bytes: ReadonlyArray<number>;
          readonly contentType: string;
          readonly method: string;
          readonly name: string;
          readonly url: string;
        }
      | undefined;
    const response = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const parts = yield* request.multipartStream.pipe(Stream.runCollect);
      for (const part of parts) {
        if (Multipart.isFile(part)) {
          received = {
            bytes: [...(yield* part.contentEffect)],
            contentType: part.contentType,
            method: request.method,
            name: part.name,
            url: request.url,
          };
        }
      }
      return HttpServerResponse.jsonUnsafe({ data: upload }, { status: 202 });
    }).pipe(Effect.orDie);

    const result = await withTempFile("receipt.png", new Uint8Array([1, 2, 3]), (filePath) =>
      withResponse(response, (baseUrl) =>
        runCommand(baseUrl, ["receipts", "uploads", "create", filePath]),
      ),
    );

    expect(received).toEqual({
      bytes: [1, 2, 3],
      contentType: "image/png",
      method: "POST",
      name: "receipt.png",
      url: "/receipt-uploads",
    });
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(upload, null, 2)}\n`,
    });
  });

  it("rejects unsupported file extensions before upload", async () => {
    const result = await withTempFile("receipt.pdf", new Uint8Array([1]), (filePath) =>
      withJsonResponse(500, {}, (baseUrl) =>
        runCommand(baseUrl, ["receipts", "uploads", "create", filePath]),
      ),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput("invalid_input", "Receipt must be a JPEG, PNG, or WebP image."),
    );
  });

  it("reports an unreadable receipt path", async () => {
    const result = await withJsonResponse(500, {}, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "uploads", "create", "/missing/receipt.png"]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput("file_error", "Receipt file could not be read: /missing/receipt.png"),
    );
  });

  it("reports a receipt rejected by the server", async () => {
    const result = await withTempFile("receipt.webp", new Uint8Array([1]), (filePath) =>
      withResponse(Effect.succeed(HttpServerResponse.empty({ status: 400 })), (baseUrl) =>
        runCommand(baseUrl, ["receipts", "uploads", "create", filePath]),
      ),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "invalid_input",
        "Receipt must be a JPEG, PNG, or WebP image no larger than 20 MB.",
      ),
    );
  });
});

describe("receipts uploads view", () => {
  it("prints the current upload resource", async () => {
    const result = await withJsonResponse(200, { data: upload }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "uploads", "view", uploadId]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(upload, null, 2)}\n`,
    });
  });

  it("reports a missing upload", async () => {
    const result = await withJsonResponse(404, { _tag: "NotFound" }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "uploads", "view", uploadId]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput("not_found", `Receipt upload ${uploadId} was not found.`),
    );
  });

  it("reports server failures", async () => {
    const result = await withJsonResponse(500, { _tag: "InternalServerError" }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "uploads", "view", uploadId]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Receipt upload status could not be retrieved. Check the server logs and try again.",
      ),
    );
  });
});

describe("receipts uploads list", () => {
  it("prints the unwrapped upload array", async () => {
    const result = await withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("/receipt-uploads");
        return HttpServerResponse.jsonUnsafe({ data: [upload] });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "uploads", "list"]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify([upload], null, 2)}\n`,
    });
  });

  it("prints an empty unwrapped array", async () => {
    const result = await withJsonResponse(200, { data: [] }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "uploads", "list"]),
    );
    expect(result).toEqual({ code: 0, stderr: "", stdout: "[]\n" });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, { _tag: "InternalServerError" }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "uploads", "list"]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Receipt uploads could not be listed. Check the server logs and try again.",
      ),
    );
  });
});

describe("receipts uploads delete", () => {
  const runDelete = (status: number, body: unknown) =>
    withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("DELETE");
        expect(request.url).toBe(`/receipt-uploads/${uploadId}`);
        return body === undefined
          ? HttpServerResponse.empty({ status })
          : HttpServerResponse.jsonUnsafe(body, { status });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "uploads", "delete", uploadId]),
    );

  it("deletes one failed upload and confirms it", async () => {
    const result = await runDelete(204, undefined);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ deleted: true, resource: "receipt-upload", id: uploadId }, null, 2)}\n`,
    });
  });

  it("reports a missing upload and exits nonzero", async () => {
    const result = await runDelete(404, { _tag: "NotFound" });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput("not_found", `Receipt upload ${uploadId} was not found.`),
    );
  });

  it("reports an upload that has not failed and exits nonzero", async () => {
    const result = await runDelete(409, { _tag: "Conflict" });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "conflict",
        `Receipt upload ${uploadId} has not failed, so it cannot be deleted. Delete the receipt to remove a successful scan.`,
      ),
    );
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await runDelete(500, { _tag: "InternalServerError" });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Receipt upload could not be deleted. Check the server logs and try again.",
      ),
    );
  });

  it("rejects a malformed upload ID and exits nonzero", async () => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "uploads", "delete", "not-a-uuid"]),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
  });
});
