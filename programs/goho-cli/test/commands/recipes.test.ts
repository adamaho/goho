import { RecipeNotFound, RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "vitest";

import {
  runCommand,
  serverProblemOutput,
  toTestResponse,
  withJsonResponse,
  withResponse,
} from "#test/cli.ts";

const recipeId = "9223372036854775807";

const summary = {
  id: recipeId,
  title: "Pancakes",
  source: { kind: "url", url: "https://example.com/recipes/pancakes" },
  totalTimeSeconds: 1800,
  hasImage: true,
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:19.07+00",
};

const recipe = {
  ...summary,
  ingredients: [
    {
      id: "butter",
      name: "unsalted butter, melted",
      quantity: { kind: "exact", value: { numerator: 1, denominator: 4 } },
      unit: "cup",
    },
    { id: "salt", name: "salt", quantity: { kind: "text", text: "to taste" }, unit: null },
  ],
  steps: [
    {
      segments: [
        { kind: "text", text: "Melt " },
        {
          kind: "mark",
          content: {
            kind: "ingredient",
            ingredientId: "butter",
            portion: { numerator: 1, denominator: 2 },
          },
        },
        { kind: "text", text: " in a pan." },
      ],
    },
  ],
  yield: {
    quantity: {
      kind: "range",
      min: { numerator: 2, denominator: 1 },
      max: { numerator: 3, denominator: 1 },
    },
    label: "servings",
  },
};

const handEntered = {
  id: "6",
  title: "Toast",
  source: null,
  totalTimeSeconds: null,
  hasImage: false,
  createdAt: "2026-11-09 08:00:00+00",
  updatedAt: "2026-11-09 08:00:00+00",
};

const expectRequest = (method: string, url: string, status: number, body: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe(method);
    expect(request.url).toBe(url);
    return body === undefined
      ? HttpServerResponse.empty({ status })
      : yield* toTestResponse(status, body);
  });

const runWithoutRequest = async (args: ReadonlyArray<string>) => {
  let requests = 0;
  const result = await withResponse(
    Effect.sync(() => {
      requests += 1;
      return HttpServerResponse.empty({ status: 500 });
    }),
    (baseUrl) => runCommand(baseUrl, ["recipes", ...args]),
  );
  expect(requests).toBe(0);
  return result;
};

describe("recipes command structure", () => {
  it("shows only the recipe operations when no subcommand is given", async () => {
    const result = await runWithoutRequest([]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const subcommands = result.stdout.split("SUBCOMMANDS\n")[1] ?? "";
    const operations = [...subcommands.matchAll(/^ {2}(\S+)\s/gm)].map((match) => match[1]);
    expect(operations).toEqual(["list", "view", "image", "create", "delete", "uploads"]);
  });

  it.each(
    ["view", "image", "delete"].flatMap((command) =>
      ["0", "01", "abc", "9223372036854775808"].map((id) => [command, id]),
    ),
  )("rejects %s recipe ID %j before sending a request", async (command, id) => {
    const result = await runWithoutRequest([command, id]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      type: "goho:cli:invalid-input",
      title: "Invalid command input",
      detail: expect.stringContaining(`Invalid value for argument <recipe-id>: "${id}"`),
    });
  });
});

describe("recipes list", () => {
  it("prints the unwrapped summaries as sent", async () => {
    const summaries = [summary, handEntered];
    const result = await withResponse(
      expectRequest("GET", "/recipes", 200, { data: summaries }),
      (baseUrl) => runCommand(baseUrl, ["recipes", "list"]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(summaries, null, 2)}\n`,
    });
  });

  it("prints an empty unwrapped array", async () => {
    const result = await withJsonResponse(200, { data: [] }, (baseUrl) =>
      runCommand(baseUrl, ["recipes", "list"]),
    );
    expect(result).toEqual({ code: 0, stderr: "", stdout: "[]\n" });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, new RecipesUnavailable(), (baseUrl) =>
      runCommand(baseUrl, ["recipes", "list"]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipesUnavailable()),
    });
  });
});

describe("recipes view", () => {
  it("prints the full unwrapped recipe as sent", async () => {
    const result = await withResponse(
      expectRequest("GET", `/recipes/${recipeId}`, 200, { data: recipe }),
      (baseUrl) => runCommand(baseUrl, ["recipes", "view", recipeId]),
    );
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify(recipe, null, 2)}\n`,
    });
  });

  it("reports a missing recipe and exits nonzero", async () => {
    const result = await withJsonResponse(404, new RecipeNotFound(), (baseUrl) =>
      runCommand(baseUrl, ["recipes", "view", recipeId]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipeNotFound()),
    });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await withJsonResponse(500, new RecipesUnavailable(), (baseUrl) =>
      runCommand(baseUrl, ["recipes", "view", recipeId]),
    );
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipesUnavailable()),
    });
  });
});

describe("recipes delete", () => {
  const runDelete = (status: number, body: unknown) =>
    withResponse(expectRequest("DELETE", `/recipes/${recipeId}`, status, body), (baseUrl) =>
      runCommand(baseUrl, ["recipes", "delete", recipeId]),
    );

  it("deletes one recipe and confirms it", async () => {
    const result = await runDelete(204, undefined);
    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({ deleted: true, resource: "recipe", id: recipeId }, null, 2)}\n`,
    });
  });

  it("reports a missing recipe and exits nonzero", async () => {
    const result = await runDelete(404, new RecipeNotFound());
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipeNotFound()),
    });
  });

  it("reports server failures and exits nonzero", async () => {
    const result = await runDelete(500, new RecipesUnavailable());
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: serverProblemOutput(new RecipesUnavailable()),
    });
  });
});
