import { NodeServices } from "@effect/platform-node";
import { ReceiptImageNotFound, ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { Effect, FileSystem, Path } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { errorOutput, runCommand, withJsonResponse, withResponse } from "#test/cli.ts";

const bytes = new Uint8Array([0, 1, 2, 255]);

const imageResponse = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");
  expect(request.url).toBe("/receipts/42/image");
  return HttpServerResponse.uint8Array(bytes, {
    contentType: "image/jpeg",
    headers: { "cache-control": "private, no-store" },
  });
});

const withImageFile = <A>(run: (directory: string, output: string) => Promise<A>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "goho-cli-test-" });
    const output = path.join(directory, "receipt-42.jpg");
    // Longer than the downloaded image, so overwrite must truncate the old file.
    yield* fileSystem.writeFile(output, new Uint8Array([9, 9, 9, 9, 9, 9]));
    const result = yield* Effect.tryPromise(() => run(directory, output)).pipe(Effect.orDie);
    return { result, saved: [...(yield* fileSystem.readFile(output))] };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

describe("receipts image", () => {
  it("saves to the default filename, replacing existing bytes, and describes the file", async () => {
    const { result, saved } = await withImageFile((directory) =>
      withResponse(imageResponse, (baseUrl) =>
        runCommand(baseUrl, ["receipts", "image", "42"], directory),
      ),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ path: "receipt-42.jpg", contentType: "image/jpeg", sizeBytes: 4 }, null, 2)}\n`,
    });
    expect(saved).toEqual([...bytes]);
  });

  it("uses --output exactly as given and saves the bytes", async () => {
    const { result, saved } = await withImageFile((directory, output) =>
      withResponse(imageResponse, async (baseUrl) => {
        const result = await runCommand(baseUrl, ["receipts", "image", "42", "--output", output]);
        expect(result).toEqual({
          code: 0,
          stderr: "",
          stdout: `${JSON.stringify({ path: output, contentType: "image/jpeg", sizeBytes: 4 }, null, 2)}\n`,
        });
        return result;
      }),
    );
    expect(result.code).toBe(0);
    expect(saved).toEqual([...bytes]);
  });

  it.each([
    {
      status: 404,
      errorCode: "not_found",
      problem: new ReceiptImageNotFound(),
      message: "Receipt 42 was not found or has no scanned image.",
    },
    {
      status: 500,
      errorCode: "request_failed",
      problem: new ReceiptsUnavailable(),
      message: "Receipt image could not be retrieved. Check the server logs and try again.",
    },
  ] as const)(
    "reports HTTP $status without touching the existing file",
    async ({ status, problem, message, errorCode }) => {
      const { result, saved } = await withImageFile((directory, output) =>
        withJsonResponse(status, problem, (baseUrl) =>
          runCommand(baseUrl, ["receipts", "image", "42", "--output", output]),
        ),
      );
      expect(result).toEqual({ code: 1, stdout: "", stderr: errorOutput(errorCode, message) });
      expect(saved).toEqual([9, 9, 9, 9, 9, 9]);
    },
  );

  it("reports a save failure with the receipt label", async () => {
    const { result, saved } = await withImageFile((directory, output) =>
      withResponse(imageResponse, (baseUrl) =>
        runCommand(baseUrl, ["receipts", "image", "42", "--output", `${output}/scan.jpg`]),
      ),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "file_error",
      message: expect.stringMatching(/^Receipt image could not be saved to /u),
    });
    expect(saved).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it("rejects a malformed receipt ID before sending a request", async () => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) => runCommand(baseUrl, ["receipts", "image", "0"]),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
  });
});
