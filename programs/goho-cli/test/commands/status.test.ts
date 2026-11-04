import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { errorOutput, runCommand, withJsonResponse, withResponse } from "#test/cli.ts";

const runStatus = (baseUrl: string) => runCommand(baseUrl, ["status"]);

describe("status", () => {
  it("prints the unwrapped server status", async () => {
    const result = await withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("/health");
        return HttpServerResponse.jsonUnsafe({ data: { status: "ok" } });
      }),
      runStatus,
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ status: "ok" }, null, 2)}\n`,
    });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, {}, runStatus);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Server status could not be retrieved. Check that the server is running.",
      ),
    );
  });

  it("reports an unreachable server and exits nonzero", async () => {
    const result = await runStatus("http://127.0.0.1:1");
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      errorOutput(
        "request_failed",
        "Server status could not be retrieved. Check that the server is running.",
      ),
    );
  });
});
