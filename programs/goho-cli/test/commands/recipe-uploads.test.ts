import {
  RecipeUploadConflict,
  RecipeUploadNotFound,
  RecipeUploadsUnavailable,
} from "@goho/goho-server-client/recipe-uploads";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  runCommand,
  serverProblemOutput,
  toTestResponse,
  validationProblem,
  validationResponse,
  withJsonResponse,
  withResponse,
} from "#test/cli.ts";

const uploadId = "7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d";
const url = "https://example.com/recipes/pancakes#step-2";
const source = { kind: "url", url };
const timestamps = {
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:19.07+00",
};

const queued = {
  id: uploadId,
  source,
  status: "queued",
  recipeId: null,
  failureCode: null,
  ...timestamps,
};
const succeeded = {
  ...queued,
  id: "00000000-0000-4000-8000-000000000003",
  status: "succeeded",
  recipeId: "9223372036854775807",
};
const uploads = [
  queued,
  { ...queued, id: "00000000-0000-4000-8000-000000000002", status: "processing" },
  succeeded,
  {
    ...queued,
    id: "00000000-0000-4000-8000-000000000004",
    status: "failed",
    failureCode: "page_unavailable",
  },
];

const runUploads = (baseUrl: string, args: ReadonlyArray<string>) =>
  runCommand(baseUrl, ["recipes", "uploads", ...args]);

const expectRequest = (method: string, path: string, status: number, body: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe(method);
    expect(request.url).toBe(path);
    return body === undefined
      ? HttpServerResponse.empty({ status })
      : yield* toTestResponse(status, body);
  });

const runWithoutRequest = async (args: ReadonlyArray<string>) => {
  let requests = 0;
  const result = await withResponse(
    Effect.sync(() => {
      requests += 1;
      return HttpServerResponse.empty({ status: 500 });
    }),
    (baseUrl) => runUploads(baseUrl, args),
  );
  expect(requests).toBe(0);
  return result;
};

const invalidInput = (detail: string) => ({
  type: "goho:cli:invalid-input",
  title: "Invalid command input",
  detail,
});

describe("recipes uploads command structure", () => {
  it("shows the import operations without sending a request", async () => {
    const result = await runWithoutRequest([]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const subcommands = result.stdout.split("SUBCOMMANDS\n")[1] ?? "";
    const operations = [...subcommands.matchAll(/^ {2}(\S+)\s/gm)].map((match) => match[1]);
    expect(operations).toEqual(["create", "list", "view", "delete"]);
  });

  it.each([
    [["create"], "Missing required argument: url"],
    [["view"], "Missing required argument: upload-id"],
    [["delete"], "Missing required argument: upload-id"],
  ])("requires an argument for %j before sending a request", async (args, detail) => {
    const result = await runWithoutRequest(args);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual(invalidInput(detail));
  });

  it.each([
    ["view", "not-a-uuid"],
    ["view", "123e4567-e89b-12d3-a456-426614174000"],
    ["delete", "not-a-uuid"],
  ])("rejects %s upload ID %j before sending a request", async (command, id) => {
    const result = await runWithoutRequest([command, id]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual(
      invalidInput(
        `Invalid value for argument <upload-id>: "${id}". Expected: Schema validation failed: Expected a UUID v4`,
      ),
    );
  });
});

describe("recipes uploads create", () => {
  it("posts the trimmed URL as JSON and prints the queued import", async () => {
    let requests = 0;
    const response = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      requests += 1;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/recipe-uploads");
      expect(request.headers["content-type"]).toBe("application/json");
      expect(yield* request.json).toEqual({ source: { kind: "url", url } });
      return HttpServerResponse.jsonUnsafe({ data: queued }, { status: 202 });
    }).pipe(Effect.orDie);

    const result = await withResponse(response, (baseUrl) =>
      runUploads(baseUrl, ["create", `  ${url}  `]),
    );

    expect(requests).toBe(1);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(queued, null, 2)}\n`,
    });
  });

  it.each([
    ["ftp://example.com/recipe", "Expected an absolute http or https URL"],
    ["example.com/recipe", "Expected an absolute http or https URL"],
    ["https://cook:secret@example.com/recipe", "Expected a URL without a username or password"],
    [
      `https://example.com/${"a".repeat(2048)}`,
      "Expected a URL no longer than 2048 UTF-8 bytes, as sent and once normalized",
    ],
  ])("rejects %j before sending a request", async (value, expected) => {
    const result = await runWithoutRequest(["create", value]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual(
      invalidInput(
        `Invalid value for argument <url>: "${value}". Expected: Schema validation failed: ${expected}`,
      ),
    );
  });

  it("forwards a request the server rejects", async () => {
    const result = await withResponse(validationResponse, (baseUrl) =>
      runUploads(baseUrl, ["create", url]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(validationProblem),
    });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, new RecipeUploadsUnavailable(), (baseUrl) =>
      runUploads(baseUrl, ["create", url]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipeUploadsUnavailable()),
    });
  });
});

describe("recipes uploads list", () => {
  it("prints imports in every status as sent", async () => {
    const result = await withResponse(
      expectRequest("GET", "/recipe-uploads", 200, { data: uploads }),
      (baseUrl) => runUploads(baseUrl, ["list"]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(uploads, null, 2)}\n`,
    });
  });

  it("prints an empty unwrapped array", async () => {
    const result = await withJsonResponse(200, { data: [] }, (baseUrl) =>
      runUploads(baseUrl, ["list"]),
    );
    expect(result).toEqual({ code: 0, stderr: "", stdout: "[]\n" });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, new RecipeUploadsUnavailable(), (baseUrl) =>
      runUploads(baseUrl, ["list"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipeUploadsUnavailable()),
    });
  });
});

describe("recipes uploads view", () => {
  it("prints the current import as sent", async () => {
    const result = await withResponse(
      expectRequest("GET", `/recipe-uploads/${succeeded.id}`, 200, { data: succeeded }),
      (baseUrl) => runUploads(baseUrl, ["view", succeeded.id]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(succeeded, null, 2)}\n`,
    });
  });

  it.each([
    [404, new RecipeUploadNotFound()],
    [500, new RecipeUploadsUnavailable()],
  ])("forwards a %i problem and exits nonzero", async (status, problem) => {
    const result = await withJsonResponse(status, problem, (baseUrl) =>
      runUploads(baseUrl, ["view", uploadId]),
    );
    expect(result).toEqual({ code: 1, stdout: "", stderr: serverProblemOutput(problem) });
  });
});

describe("recipes uploads delete", () => {
  const runDelete = (status: number, body: unknown) =>
    withResponse(expectRequest("DELETE", `/recipe-uploads/${uploadId}`, status, body), (baseUrl) =>
      runUploads(baseUrl, ["delete", uploadId]),
    );

  it("deletes one failed import and confirms it", async () => {
    const result = await runDelete(204, undefined);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ deleted: true, resource: "recipe-upload", id: uploadId }, null, 2)}\n`,
    });
  });

  it.each([
    [404, new RecipeUploadNotFound()],
    [409, new RecipeUploadConflict()],
    [500, new RecipeUploadsUnavailable()],
  ])("forwards a %i problem and exits nonzero", async (status, problem) => {
    const result = await runDelete(status, problem);
    expect(result).toEqual({ code: 1, stdout: "", stderr: serverProblemOutput(problem) });
  });
});
