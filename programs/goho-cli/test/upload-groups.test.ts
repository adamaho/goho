import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import { runCommand, withResponse } from "./cli.ts";

const uploadId = "00000000-0000-4000-8000-000000000001";

describe.each(["books", "receipts"])("%s upload command structure", (group) => {
  const runWithoutRequest = async (args: ReadonlyArray<string>) => {
    let requests = 0;
    const result = await withResponse(
      Effect.sync(() => {
        requests += 1;
        return HttpServerResponse.empty({ status: 500 });
      }),
      (baseUrl) => runCommand(baseUrl, [group, ...args]),
    );
    expect(requests).toBe(0);
    return result;
  };

  it("shows upload operations without listing uploads when no subcommand is given", async () => {
    const result = await runWithoutRequest(["uploads"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`goho ${group} uploads`);
    for (const operation of ["create", "list", "view", "delete"]) {
      expect(result.stdout).toMatch(new RegExp(`^  ${operation}\\s`, "m"));
    }
  });

  it.each([
    ["upload", "scan.png"],
    ["status", uploadId],
    ["delete-upload", uploadId],
  ])("rejects the previous flat form: %j", async (...args) => {
    const result = await runWithoutRequest(args);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Unknown subcommand "${args[0]}"`);
  });

  it.each([["create"], ["view"], ["view", "not-a-uuid"], ["delete"]])(
    "requires arguments for uploads %j before sending a request",
    async (...args) => {
      const result = await runWithoutRequest(["uploads", ...args]);
      expect(result.code).toBe(1);
      expect(result.stdout + result.stderr).not.toBe("");
    },
  );
});
