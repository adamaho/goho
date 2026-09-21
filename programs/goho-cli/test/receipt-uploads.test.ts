import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse, Multipart } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { runCommand, withJsonResponse, withResponse } from "./cli.ts";

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

describe("receipts upload", () => {
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
      withResponse(response, (baseUrl) => runCommand(baseUrl, ["receipts", "upload", filePath])),
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
      withJsonResponse(500, {}, (baseUrl) => runCommand(baseUrl, ["receipts", "upload", filePath])),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Receipt must be a JPEG, PNG, or WebP image.\n");
  });

  it("reports an unreadable receipt path", async () => {
    const result = await withJsonResponse(500, {}, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "upload", "/missing/receipt.png"]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Receipt file could not be read: /missing/receipt.png\n");
  });

  it("reports a receipt rejected by the server", async () => {
    const result = await withTempFile("receipt.webp", new Uint8Array([1]), (filePath) =>
      withResponse(Effect.succeed(HttpServerResponse.empty({ status: 400 })), (baseUrl) =>
        runCommand(baseUrl, ["receipts", "upload", filePath]),
      ),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Receipt must be a JPEG, PNG, or WebP image no larger than 20 MB.\n",
    );
  });
});

describe("receipts status", () => {
  it("prints the current upload resource", async () => {
    const result = await withJsonResponse(200, { data: upload }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "status", uploadId]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(upload, null, 2)}\n`,
    });
  });

  it("reports a missing upload", async () => {
    const result = await withJsonResponse(404, { _tag: "NotFound" }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "status", uploadId]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Receipt upload ${uploadId} was not found.\n`);
  });

  it("reports server failures", async () => {
    const result = await withJsonResponse(500, { _tag: "InternalServerError" }, (baseUrl) =>
      runCommand(baseUrl, ["receipts", "status", uploadId]),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Receipt upload status could not be retrieved. Check the server logs and try again.\n",
    );
  });
});
