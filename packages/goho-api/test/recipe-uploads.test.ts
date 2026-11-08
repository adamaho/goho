import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { CreateRecipeUploadRequest, RecipeUpload } from "#src/recipe-uploads.ts";

const upload = {
  id: "7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d",
  source: { kind: "url", url: "https://example.com/recipes/pancakes" },
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:19.07+00",
};

const decodes = (value: unknown) => Option.isSome(Schema.decodeUnknownOption(RecipeUpload)(value));

describe("RecipeUpload", () => {
  it.each([
    { status: "queued", recipeId: null, failureCode: null },
    { status: "processing", recipeId: null, failureCode: null },
    { status: "succeeded", recipeId: "5", failureCode: null },
    { status: "failed", recipeId: null, failureCode: "page_unavailable" },
  ])("accepts a consistent outcome: %j", (outcome) => {
    expect(decodes({ ...upload, ...outcome })).toBe(true);
  });

  it.each([
    { status: "queued", recipeId: "5", failureCode: null },
    { status: "processing", recipeId: null, failureCode: "internal_error" },
    { status: "succeeded", recipeId: null, failureCode: null },
    { status: "succeeded", recipeId: "5", failureCode: "internal_error" },
    { status: "failed", recipeId: null, failureCode: null },
    { status: "failed", recipeId: "5", failureCode: "no_recipe_found" },
  ])("rejects an outcome that doesn't match the status: %j", (outcome) => {
    expect(decodes({ ...upload, ...outcome })).toBe(false);
  });

  it("requires a source", () => {
    expect(
      decodes({ ...upload, source: null, status: "queued", recipeId: null, failureCode: null }),
    ).toBe(false);
  });
});

describe("CreateRecipeUploadRequest", () => {
  it("rejects a source that is not an http or https URL", () => {
    expect(
      Option.isNone(
        Schema.decodeOption(CreateRecipeUploadRequest)({
          source: { kind: "url", url: "file:///etc/passwd" },
        }),
      ),
    ).toBe(true);
  });
});
