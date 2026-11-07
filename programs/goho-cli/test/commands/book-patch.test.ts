import { BookConflict, BookNotFound, BooksUnavailable } from "@goho/goho-server-client/books";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  runCommand,
  serverProblemOutput,
  toTestResponse,
  validationProblem,
  withResponse,
} from "#test/cli.ts";

const fiction = { id: "9", name: "fiction", icon: "other", color: "grey", kinds: ["book"] };
const fantasy = { id: "10", name: "fantasy", icon: "other", color: "grey", kinds: ["book"] };
const book = {
  id: "12",
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: fiction,
  readingLevel: "Grade 4",
  hasImage: false,
};

const runPatch = (args: ReadonlyArray<string>, payload: unknown, status: number, body: unknown) =>
  withResponse(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      expect(request.method).toBe("PATCH");
      expect(request.url).toBe(`/books/${book.id}`);
      expect(yield* request.json.pipe(Effect.orDie)).toEqual(payload);
      return yield* toTestResponse(status, body);
    }),
    (baseUrl) => runCommand(baseUrl, ["books", ...args]),
  );

describe("books patch", () => {
  it.each([
    {
      flags: ["--title", "  The Hobbit  "],
      changes: { title: "The Hobbit" },
      saved: { title: "The Hobbit" },
    },
    {
      flags: ["--author", "Tolkien"],
      changes: { author: "Tolkien" },
      saved: { author: "Tolkien" },
    },
    {
      flags: ["--category", "  Fantasy  "],
      changes: { category: "Fantasy" },
      saved: { category: fantasy },
    },
    {
      flags: ["--reading-level", "Grade 5"],
      changes: { readingLevel: "Grade 5" },
      saved: { readingLevel: "Grade 5" },
    },
    {
      flags: ["--title", "The Hobbit", "--author", "Tolkien", "--reading-level", "Grade 5"],
      changes: { title: "The Hobbit", author: "Tolkien", readingLevel: "Grade 5" },
      saved: { title: "The Hobbit", author: "Tolkien", readingLevel: "Grade 5" },
    },
  ])(
    "sends only supplied fields and prints the saved book: $changes",
    async ({ flags, changes, saved }) => {
      const result = await runPatch(["patch", book.id, ...flags], changes, 200, {
        data: { ...book, ...saved },
      });
      expect(result).toEqual({
        code: 0,
        stderr: "",
        stdout: `${JSON.stringify({ ...book, ...saved }, null, 2)}\n`,
      });
    },
  );

  it.each([
    {
      status: 400,
      problem: validationProblem,
    },
    {
      status: 404,
      problem: new BookNotFound(),
    },
    {
      status: 409,
      problem: new BookConflict(),
    },
    {
      status: 500,
      problem: new BooksUnavailable(),
    },
  ] as const)("reports HTTP $status and exits nonzero", async ({ status, problem }) => {
    const result = await runPatch(
      ["patch", book.id, "--title", "The Hobbit"],
      { title: "The Hobbit" },
      status,
      problem,
    );
    expect(result).toEqual({ code: 1, stdout: "", stderr: serverProblemOutput(problem) });
  });
});

describe("book patch validation", () => {
  it.each([
    ["patch", "12"],
    ["patch", "12", "--title", "   "],
    ["patch", "12", "--author", ""],
    ["patch", "12", "--category", " "],
    ["patch", "12", "--reading-level", "  "],
    ["patch", "12", "--title", "The Hobbit", "--author", " "],
    ["patch", "0", "--title", "The Hobbit"],
    ["patch", "01", "--title", "The Hobbit"],
    ["patch", "12", "--title", "The Hobbit", "--has-image", "true"],
  ])("rejects invalid arguments before sending a request: %j", async (...args) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.jsonUnsafe({ data: book });
      }),
      (baseUrl) => runCommand(baseUrl, ["books", ...args]),
    );
    expect(result.code).toBe(1);
    expect(requests).toBe(0);
    expect(result.stdout + result.stderr).not.toBe("");
  });
});
