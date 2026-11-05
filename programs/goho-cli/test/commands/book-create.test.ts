import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { errorOutput, runCommand, validationResponse, withResponse } from "#test/cli.ts";

const book = {
  id: "12",
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: { id: "9", name: "fiction", icon: "other", color: "grey", kinds: ["book"] },
  readingLevel: "Grade 4",
  hasImage: false,
};

const runCreate = (flags: ReadonlyArray<string>, payload: unknown, status: number, body: unknown) =>
  withResponse(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/books");
      expect(yield* request.json.pipe(Effect.orDie)).toEqual(payload);
      return status === 400
        ? yield* validationResponse
        : HttpServerResponse.jsonUnsafe(body, { status });
    }),
    (baseUrl) => runCommand(baseUrl, ["books", "create", ...flags]),
  );

describe("books create", () => {
  it.each([
    {
      flags: ["--title", "  The Hobbit  ", "--category", " Fiction "],
      fields: { title: "The Hobbit", category: "Fiction" },
    },
    {
      flags: ["--title", "The Hobbit", "--category", "Fiction", "--author", "J. R. R. Tolkien"],
      fields: { title: "The Hobbit", category: "Fiction", author: "J. R. R. Tolkien" },
    },
    {
      flags: ["--title", "The Hobbit", "--category", "Fiction", "--reading-level", "Grade 4"],
      fields: { title: "The Hobbit", category: "Fiction", readingLevel: "Grade 4" },
    },
  ])("sends only supplied fields and prints the book: $fields", async ({ flags, fields }) => {
    const result = await runCreate(flags, fields, 200, { data: book });
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(book, null, 2)}\n`,
    });
  });

  it.each([
    {
      status: 400,
      errorCode: "invalid_input",
      tag: "BadRequestProblem",
      message: "The book was rejected. Check the supplied values.",
    },
    {
      status: 500,
      errorCode: "request_failed",
      tag: "BooksUnavailable",
      message: "Book could not be created. Check the server logs and try again.",
    },
  ] as const)(
    "reports HTTP $status and exits nonzero",
    async ({ status, tag, message, errorCode }) => {
      const result = await runCreate(
        ["--title", "The Hobbit", "--category", "Fiction"],
        { title: "The Hobbit", category: "Fiction" },
        status,
        { _tag: tag },
      );
      expect(result).toEqual({ code: 1, stdout: "", stderr: errorOutput(errorCode, message) });
    },
  );
});

describe("book create validation", () => {
  it.each([
    [],
    ["--title", "The Hobbit"],
    ["--category", "Fiction"],
    ["--title", "   ", "--category", "Fiction"],
    ["--title", "The Hobbit", "--category", " "],
    ["--title", "The Hobbit", "--category", "Fiction", "--author", ""],
    ["--title", "The Hobbit", "--category", "Fiction", "--reading-level", "  "],
    ["--title", "The Hobbit", "--category", "Fiction", "--has-image", "true"],
  ])("rejects invalid arguments before sending a request: %j", async (...args) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.jsonUnsafe({ data: book });
      }),
      (baseUrl) => runCommand(baseUrl, ["books", "create", ...args]),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout + result.stderr).not.toBe("");
  });
});
