import { Cause, Effect } from "effect";
import { CliError } from "effect/cli";
import { describe, expect, it } from "vitest";

import { getProblem } from "#src/errors.ts";

// Parse errors, server problems and request failures are covered by CLI
// subprocess tests; these cover failures a real command cannot trigger.
describe("getProblem", () => {
  it("leaves implicit group help and interruption to the runtime", async () => {
    const help = new CliError.ShowHelp({ commandPath: ["goho"], errors: [] });
    expect(await getProblem(Cause.fail(help)).pipe(Effect.runPromise)).toBeUndefined();
    expect(await getProblem(Cause.interrupt()).pipe(Effect.runPromise)).toBeUndefined();
  });

  it.each([
    ["a defect", Cause.die(new Error("PRIVATE_SECRET"))],
    ["an unknown failure", Cause.fail(new Error("PRIVATE_SECRET"))],
  ])("reports %s as a generic unexpected failure", async (_, cause) => {
    expect(await getProblem(cause).pipe(Effect.runPromise)).toEqual({
      type: "goho:cli:unexpected-failure",
      title: "Unexpected failure",
      detail: "The command failed unexpectedly. Try again.",
    });
  });
});
