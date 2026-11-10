import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  cliProblemOutput,
  connectionDetail,
  problemOutput,
  runCommand,
  unexpectedResponseDetail,
  withResponse,
} from "./cli.ts";

const uploadId = "123e4567-e89b-42d3-a456-426614174000";

// Runs the CLI against a server that counts requests and fails each one.
const runWithoutRequest = async (args: ReadonlyArray<string>) => {
  let requests = 0;
  const result = await withResponse(
    Effect.sync(() => {
      requests += 1;
      return HttpServerResponse.empty({ status: 500 });
    }),
    (baseUrl) => runCommand(baseUrl, args),
  );
  return { ...result, requests };
};

const problemResponse = (status: number, body: unknown) =>
  Effect.succeed(
    HttpServerResponse.jsonUnsafe(body, { status, contentType: "application/problem+json" }),
  );

describe("CLI problem output", () => {
  it("forwards a declared server problem and drops undeclared members", async () => {
    const result = await withResponse(
      problemResponse(404, {
        type: "goho:problem:book-not-found",
        status: 404,
        title: "Book not found",
        _tag: "PRIVATE_TAG",
        stack: "PRIVATE_SERVER_STACK",
      }),
      (baseUrl) => runCommand(baseUrl, ["books", "view", "12"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: problemOutput({
        type: "goho:problem:book-not-found",
        status: 404,
        title: "Book not found",
      }),
    });
  });

  it("forwards server detail, instance, and declared extensions as sent", async () => {
    const result = await withResponse(
      problemResponse(400, {
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
        instance: "/books",
        errors: [{ path: ["payload", "title"], message: "Expected a nonblank string" }],
        secret: "PRIVATE_EXTENSION",
      }),
      (baseUrl) =>
        runCommand(baseUrl, ["books", "create", "--title", "Dune", "--category", "Sci-fi"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: problemOutput({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
        instance: "/books",
        errors: [{ path: ["payload", "title"], message: "Expected a nonblank string" }],
      }),
    });
  });

  it("reports handler validation as a local problem without making a request", async () => {
    const result = await runWithoutRequest([
      "books",
      "create",
      "--title",
      " ",
      "--category",
      "Fiction",
    ]);
    expect(result).toEqual({
      code: 1,
      requests: 0,
      stdout: "",
      stderr: cliProblemOutput(
        "goho:cli:invalid-input",
        "Values for --title, --category, --author, and --reading-level must be nonblank.",
      ),
    });
  });

  it.each([
    [["bogus"], 'Unknown subcommand "bogus" for "goho"\n\n  Did you mean this?\n    books'],
    [["books", "list", "--nope"], "Unrecognized flag: --nope in command goho books list"],
    [["books", "list", "extra"], 'Unexpected positional argument: "extra"'],
    [["books", "create", "--title", "Dune"], "Missing required flag: --category"],
    [["books", "view"], "Missing required argument: book-id"],
    [
      ["receipts", "view", "abc"],
      'Invalid value for argument <receipt-id>: "abc". Expected: Schema validation failed: Expected a string matching the RegExp ^[1-9]\\d{0,18}$',
    ],
    [
      ["--completions", "bogus"],
      'Invalid value for flag --completions: "bogus". Expected: "bash" | "zsh" | "fish" | "powershell" | "sh" | "pwsh"',
    ],
  ])("reports parse error %j as one invalid-input problem without help", async (args, detail) => {
    const result = await runWithoutRequest(args);
    expect(result).toEqual({
      code: 1,
      requests: 0,
      stdout: "",
      stderr: cliProblemOutput("goho:cli:invalid-input", detail),
    });
  });

  it("puts several parse errors in one detail", async () => {
    const result = await runWithoutRequest(["books", "create", "--nope", "--title"]);
    expect(result).toEqual({
      code: 1,
      requests: 0,
      stdout: "",
      stderr: cliProblemOutput(
        "goho:cli:invalid-input",
        "Unrecognized flag: --nope in command goho books create\nMissing value for flag --title. Expected: string",
      ),
    });
  });

  it.each([
    [["--help"], "goho <subcommand> [flags]"],
    [["books", "view", "--help"], "goho books view [flags] <book-id>"],
    [[], "goho <subcommand> [flags]"],
    [["receipts"], "goho receipts <subcommand> [flags]"],
    [["recipes"], "goho recipes <subcommand> [flags]"],
    [["recipes", "uploads"], "goho recipes uploads <subcommand> [flags]"],
    [["books", "uploads"], "goho books uploads <subcommand> [flags]"],
    [["--version"], "goho v0.0.0"],
    [["--completions", "bash"], "###-begin-goho-completions-###"],
  ])("prints %j to stdout and exits 0", async (args, expected) => {
    const result = await runWithoutRequest(args);
    expect(result).toEqual({
      code: 0,
      requests: 0,
      stdout: expect.stringContaining(expected),
      stderr: "",
    });
  });

  it.each([
    [["status"]],
    [["books", "list"]],
    [["books", "image", "12"]],
    [["receipts", "view", "3"]],
    [["receipts", "delete", "3"]],
    [["receipts", "uploads", "view", uploadId]],
    [["books", "uploads", "list"]],
    [["recipes", "list"]],
    [["recipes", "image", "5"]],
  ])("reports an unreachable server for %j as connection-failed", async (args) => {
    const result = await runCommand("http://127.0.0.1:1", args);
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: cliProblemOutput("goho:cli:connection-failed", connectionDetail),
    });
  });

  it.each([
    [
      "a body that is not JSON",
      HttpServerResponse.text("PRIVATE_BODY", { contentType: "application/json" }),
    ],
    ["a body that does not match", HttpServerResponse.jsonUnsafe({ data: "PRIVATE_BODY" })],
    ["an undeclared status", HttpServerResponse.text("PRIVATE_BODY", { status: 404 })],
    [
      "a problem the endpoint does not declare",
      HttpServerResponse.jsonUnsafe(
        { type: "goho:problem:other", status: 500, title: "Other", detail: "PRIVATE_DETAIL" },
        { status: 500, contentType: "application/problem+json" },
      ),
    ],
  ])("reports %s as an unexpected response", async (_, response) => {
    const result = await withResponse(Effect.succeed(response), (baseUrl) =>
      runCommand(baseUrl, ["books", "list"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: cliProblemOutput("goho:cli:unexpected-response", unexpectedResponseDetail),
    });
  });
});
