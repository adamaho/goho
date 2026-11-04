import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { runCommand, withJsonResponse, withResponse } from "./cli.ts";

const bytes = new Uint8Array([0, 1, 2, 255]);

const coverResponse = (contentType: string) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/books/12/image");
    return HttpServerResponse.uint8Array(bytes, {
      contentType,
      headers: { "cache-control": "private, no-store" },
    });
  });

const withTempDirectory = <A>(run: (directory: string) => Promise<A>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "goho-cli-test-" });
    return yield* Effect.tryPromise(() => run(directory)).pipe(Effect.orDie);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

const readBytes = (filePath: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return [...(yield* fileSystem.readFile(filePath))];
  }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);

const writeBytes = (filePath: string, contents: ReadonlyArray<number>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.writeFile(filePath, new Uint8Array(contents));
  }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);

const join = (directory: string, name: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(directory, name);
  }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);

const runImage = (contentType: string, args: ReadonlyArray<string>) =>
  withResponse(coverResponse(contentType), (baseUrl) =>
    runCommand(baseUrl, ["books", "image", "12", ...args]),
  );

describe("books image", () => {
  it("saves the exact bytes to --output and describes the file", async () => {
    await withTempDirectory(async (directory) => {
      const output = await join(directory, "cover.png");
      const result = await runImage("image/png", ["--output", output]);
      expect(result).toEqual({
        code: 0,
        stderr: "",
        stdout: `${JSON.stringify({ path: output, contentType: "image/png", sizeBytes: 4 }, null, 2)}\n`,
      });
      expect(await readBytes(output)).toEqual([...bytes]);
    });
  });

  it("keeps --output as given when its extension differs from the type", async () => {
    await withTempDirectory(async (directory) => {
      const output = await join(directory, "cover.png");
      const result = await runImage("image/webp", ["--output", output]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        path: output,
        contentType: "image/webp",
        sizeBytes: 4,
      });
    });
  });

  it.each([
    { contentType: "image/jpeg", name: "book-12.jpg" },
    { contentType: "image/png", name: "book-12.png" },
    { contentType: "image/webp", name: "book-12.webp" },
  ])("names the file $name by default for $contentType", async ({ contentType, name }) => {
    await withTempDirectory(async (directory) => {
      const result = await withResponse(coverResponse(contentType), (baseUrl) =>
        runCommand(baseUrl, ["books", "image", "12"], directory),
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout).path).toBe(name);
      expect(await readBytes(await join(directory, name))).toEqual([...bytes]);
    });
  });

  it("refuses an unexpected type without --output", async () => {
    await withTempDirectory(async (directory) => {
      const result = await withResponse(coverResponse("image/gif"), (baseUrl) =>
        runCommand(baseUrl, ["books", "image", "12"], directory),
      );
      expect(result).toEqual({
        code: 1,
        stdout: "",
        stderr: "Book cover has an unexpected type, image/gif. Choose a file name with --output.\n",
      });
    });
  });

  it("replaces an existing file by default", async () => {
    await withTempDirectory(async (directory) => {
      const output = await join(directory, "cover.png");
      await writeBytes(output, [9]);
      const result = await runImage("image/png", ["--output", output]);
      expect(result.code).toBe(0);
      expect(await readBytes(output)).toEqual([...bytes]);
    });
  });

  it("reports a folder that does not exist", async () => {
    await withTempDirectory(async (directory) => {
      const output = await join(directory, "missing/cover.png");
      const result = await runImage("image/png", ["--output", output]);
      expect(result).toEqual({
        code: 1,
        stdout: "",
        stderr: `Book cover could not be saved to ${output}.\n`,
      });
    });
  });

  it("reports a missing cover and exits nonzero", async () => {
    const result = await withJsonResponse(404, { _tag: "BookImageNotFound" }, (baseUrl) =>
      runCommand(baseUrl, ["books", "image", "12"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Book 12 was not found or has no cover image.\n",
    });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, { _tag: "BooksUnavailable" }, (baseUrl) =>
      runCommand(baseUrl, ["books", "image", "12"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Book cover could not be retrieved. Check the server logs and try again.\n",
    });
  });

  it("rejects a malformed book ID before sending a request", async () => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) => runCommand(baseUrl, ["books", "image", "0"]),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
  });
});
