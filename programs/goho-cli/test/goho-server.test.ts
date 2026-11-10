import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { cliProblemOutput, runCommand, withResponse } from "./cli.ts";

const configurationDetail =
  "Set GOHO_SERVER_URL to an absolute http or https URL, such as http://127.0.0.1:3000.";

describe("GOHO_SERVER_URL", () => {
  it.each(["", " ", "not a url", "127.0.0.1:3000", "http://", "ftp://127.0.0.1", "file:///tmp"])(
    "rejects %j before any request",
    async (url) => {
      for (const args of [["status"], ["books", "list"]]) {
        const result = await runCommand(url, args);
        expect(result).toEqual({
          code: 1,
          stdout: "",
          stderr: cliProblemOutput("goho:cli:configuration-error", configurationDetail),
        });
      }
    },
  );

  it.each([
    [["--help"], "goho <subcommand> [flags]"],
    [["--version"], "goho v0.0.0"],
    [["books", "view", "--help"], "goho books view [flags] <book-id>"],
    [[], "goho <subcommand> [flags]"],
    [["receipts"], "goho receipts <subcommand> [flags]"],
    [["recipes"], "goho recipes <subcommand> [flags]"],
    [["recipes", "view", "--help"], "goho recipes view [flags] <recipe-id>"],
    [["books", "uploads"], "goho books uploads <subcommand> [flags]"],
  ])("still prints %j with an invalid or empty URL", async (args, expected) => {
    for (const url of ["not a url", ""]) {
      const result = await runCommand(url, args);
      expect(result).toEqual({ code: 0, stdout: expect.stringContaining(expected), stderr: "" });
    }
  });

  it("keeps a base path in the URL", async () => {
    const result = await withResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.url).toBe("/goho/health");
        return HttpServerResponse.jsonUnsafe({ data: { status: "ok" } });
      }),
      (baseUrl) => runCommand(`${baseUrl}/goho`, ["status"]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ status: "ok" }, null, 2)}\n`,
    });
  });
});
