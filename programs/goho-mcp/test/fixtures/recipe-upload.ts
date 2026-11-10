import { recipe } from "./recipe.ts";

/**
 * A recipe page URL used by MCP tests. It is never fetched; its fragment shows the URL passes
 * through unchanged, since normalizing it is the Goho API's job.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const recipeUploadUrl = "https://example.com/recipes/pancakes#method";

const upload = {
  source: { kind: "url", url: recipeUploadUrl },
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:11.52+00",
};

/**
 * A recipe upload waiting for its page to be fetched, as a new upload is returned.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const queuedUpload = {
  ...upload,
  id: "7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d",
  status: "queued",
  recipeId: null,
  failureCode: null,
};

/**
 * A recipe upload whose page is being processed.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const processingUpload = {
  ...upload,
  id: "1f6d2c3b-4a5e-4b7c-9d8e-0f1a2b3c4d5e",
  status: "processing",
  recipeId: null,
  failureCode: null,
  updatedAt: "2026-11-08 14:03:12.10+00",
};

/**
 * A recipe upload that saved the recipe fixture, whose ID is above 2^53.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const succeededUpload = {
  ...upload,
  id: "a3b4c5d6-e7f8-4a9b-8c0d-1e2f3a4b5c6d",
  status: "succeeded",
  recipeId: recipe.id,
  failureCode: null,
  updatedAt: "2026-11-08 14:03:19.07+00",
};

/**
 * A recipe upload that could not fetch its page.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const failedUpload = {
  ...upload,
  id: "0e9d8c7b-6a5f-4e3d-a2c1-b0a9f8e7d6c5",
  status: "failed",
  recipeId: null,
  failureCode: "page_unavailable",
  updatedAt: "2026-11-08 14:03:15.44+00",
};
