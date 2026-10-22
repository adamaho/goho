import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { runCommand, withJsonResponse, withResponse } from "./cli.ts";

const runList = (baseUrl: string) => runCommand(baseUrl, ["books", "list"]);

const runView = (bookId: string, baseUrl: string) => runCommand(baseUrl, ["books", "view", bookId]);

const book = {
  id: "12",
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: { id: "9", name: "fiction", icon: "other", color: "grey", kinds: ["book"] },
  readingLevel: "Grade 4",
  hasImage: false,
};

describe("books list", () => {
  it("prints the unwrapped book array", async () => {
    const books = [book];
    const result = await withJsonResponse(200, { data: books }, runList);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(books, null, 2)}\n`,
    });
  });

  it("prints an empty unwrapped array", async () => {
    const result = await withJsonResponse(200, { data: [] }, runList);
    expect(result).toEqual({ code: 0, stderr: "", stdout: "[]\n" });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, { _tag: "BooksUnavailable" }, runList);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Books could not be listed. Check the server logs and try again.\n");
  });
});

describe("books view", () => {
  it("prints one unwrapped book", async () => {
    const result = await withJsonResponse(200, { data: book }, (baseUrl) =>
      runView(book.id, baseUrl),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(book, null, 2)}\n`,
    });
  });

  it("reports a missing book and exits nonzero", async () => {
    const result = await withJsonResponse(404, { _tag: "BookNotFound" }, (baseUrl) =>
      runView(book.id, baseUrl),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Book ${book.id} was not found.\n`);
  });
});

describe("books delete", () => {
  const runDelete = (status: number, body: unknown) =>
    withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("DELETE");
        expect(request.url).toBe(`/books/${book.id}`);
        return body === undefined
          ? HttpServerResponse.empty({ status })
          : HttpServerResponse.jsonUnsafe(body, { status });
      }),
      (baseUrl) => runCommand(baseUrl, ["books", "delete", book.id]),
    );

  it("deletes one book and confirms it", async () => {
    const result = await runDelete(204, undefined);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `Deleted book ${book.id}.\n`,
    });
  });

  it("reports a missing book and exits nonzero", async () => {
    const result = await runDelete(404, { _tag: "BookNotFound" });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Book ${book.id} was not found.\n`);
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await runDelete(500, { _tag: "BooksUnavailable" });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Book could not be deleted. Check the server logs and try again.\n");
  });

  it("rejects a malformed book ID and exits nonzero", async () => {
    const result = await withJsonResponse(500, {}, (baseUrl) =>
      runCommand(baseUrl, ["books", "delete", "0"]),
    );
    expect(result.code).toBe(1);
  });
});
