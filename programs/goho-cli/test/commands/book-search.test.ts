import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { errorOutput, runCommand, withJsonResponse, withResponse } from "#test/cli.ts";

const book = {
  id: "12",
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: { id: "9", name: "fiction", icon: "other", color: "grey", kinds: ["book"] },
  readingLevel: "Grade 4",
  hasImage: false,
};

describe("books search", () => {
  it("sends trimmed search text and prints the matching array", async () => {
    const result = await withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("/books?search=the+hobbit");
        return HttpServerResponse.jsonUnsafe({ data: [book] });
      }),
      (baseUrl) => runCommand(baseUrl, ["books", "search", "  the hobbit  "]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify([book], null, 2)}\n`,
    });
  });

  it("prints an empty array when no books match", async () => {
    const result = await withJsonResponse(200, { data: [] }, (baseUrl) =>
      runCommand(baseUrl, ["books", "search", "not here"]),
    );
    expect(result).toEqual({ code: 0, stderr: "", stdout: "[]\n" });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, { _tag: "BooksUnavailable" }, (baseUrl) =>
      runCommand(baseUrl, ["books", "search", "hobbit"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: errorOutput(
        "request_failed",
        "Books could not be searched. Check the server logs and try again.",
      ),
    });
  });

  it.each([["search"], ["search", ""], ["search", "   "], ["list", "--search", "hobbit"]])(
    "rejects invalid arguments without a request: %j",
    async (...args) => {
      let requests = 0;
      const result = await withResponse(
        Effect.sync(() => {
          requests += 1;
          return HttpServerResponse.jsonUnsafe({ data: [book] });
        }),
        (baseUrl) => runCommand(baseUrl, ["books", ...args]),
      );
      expect(result.code).toBe(1);
      expect(requests).toBe(0);
      expect(result.stdout + result.stderr).not.toBe("");
    },
  );
});
