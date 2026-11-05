import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { errorOutput, runCommand, withResponse } from "./cli.ts";

describe("CLI error output", () => {
  it("writes one public JSON error to stderr without server details or a stack", async () => {
    const result = await withResponse(
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          {
            type: "goho:problem:books-unavailable",
            status: 500,
            title: "Books unavailable",
            detail: "PRIVATE_DATABASE_PASSWORD",
            stack: "PRIVATE_SERVER_STACK",
          },
          { status: 500, contentType: "application/problem+json" },
        ),
      ),
      (baseUrl) => runCommand(baseUrl, ["books", "list"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: errorOutput(
        "request_failed",
        "Books could not be listed. Check the server logs and try again.",
      ),
    });
    expect(result.stderr).not.toContain("PRIVATE_");
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: "request_failed",
        message: "Books could not be listed. Check the server logs and try again.",
      },
    });
  });

  it("emits invalid_input for handler validation without making a request", async () => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) =>
        runCommand(baseUrl, ["books", "create", "--title", " ", "--category", "Fiction"]),
    );
    expect(requests).toBe(0);
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: errorOutput(
        "invalid_input",
        "Values for --title, --category, --author, and --reading-level must be nonblank.",
      ),
    });
  });

  it("leaves parser errors and their help rendering unchanged", async () => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) => runCommand(baseUrl, ["books", "view"]),
    );
    expect(requests).toBe(0);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Missing required argument: book-id");
    expect(result.stdout).toContain("goho books view");
  });
});
