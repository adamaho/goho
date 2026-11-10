import { NodeServices } from "@effect/platform-node";
import { RecipeImageNotFound, RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect, FileSystem, Path } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  cliProblemOutput,
  runCommand,
  serverProblemOutput,
  withJsonResponse,
  withResponse,
} from "#test/cli.ts";

const bytes = new Uint8Array([0, 1, 2, 255]);

const photoResponse = (contentType: string) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/recipes/5/image");
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

const join = (directory: string, name: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(directory, name);
  }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);

describe("recipes image", () => {
  it("saves the exact bytes to --output and describes the file", async () => {
    await withTempDirectory(async (directory) => {
      const output = await join(directory, "photo.jpg");
      const result = await withResponse(photoResponse("image/jpeg"), (baseUrl) =>
        runCommand(baseUrl, ["recipes", "image", "5", "--output", output]),
      );
      expect(result).toEqual({
        code: 0,
        stderr: "",
        stdout: `${JSON.stringify({ path: output, contentType: "image/jpeg", sizeBytes: 4 }, null, 2)}\n`,
      });
      expect(await readBytes(output)).toEqual([...bytes]);
    });
  });

  it("names the file recipe-<id> with the image's extension by default", async () => {
    await withTempDirectory(async (directory) => {
      const result = await withResponse(photoResponse("image/webp"), (baseUrl) =>
        runCommand(baseUrl, ["recipes", "image", "5"], directory),
      );
      expect(result).toEqual({
        code: 0,
        stderr: "",
        stdout: `${JSON.stringify({ path: "recipe-5.webp", contentType: "image/webp", sizeBytes: 4 }, null, 2)}\n`,
      });
      expect(await readBytes(await join(directory, "recipe-5.webp"))).toEqual([...bytes]);
    });
  });

  it("names the photo in local file problems", async () => {
    await withTempDirectory(async (directory) => {
      const result = await withResponse(photoResponse("image/gif"), (baseUrl) =>
        runCommand(baseUrl, ["recipes", "image", "5"], directory),
      );
      expect(result).toEqual({
        code: 1,
        stdout: "",
        stderr: cliProblemOutput(
          "goho:cli:file-error",
          "Recipe photo has an unexpected type, image/gif. Choose a file name with --output.",
        ),
      });
    });
  });

  it("reports a missing photo and exits nonzero", async () => {
    const result = await withJsonResponse(404, new RecipeImageNotFound(), (baseUrl) =>
      runCommand(baseUrl, ["recipes", "image", "5"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipeImageNotFound()),
    });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, new RecipesUnavailable(), (baseUrl) =>
      runCommand(baseUrl, ["recipes", "image", "5"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipesUnavailable()),
    });
  });
});
