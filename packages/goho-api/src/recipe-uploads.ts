import { Schema } from "effect";
import { HttpApiError } from "effect/http-api";

import { RecipeId, RecipeSource, RecipeUrl } from "./recipes.ts";

/**
 * Identity of a recipe import and its queued job.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUploadId = Schema.String.check(Schema.isUUID(4))
  .annotate({
    identifier: "RecipeUploadId",
    description: "The recipe import's version 4 UUID; use it to check on this upload.",
    examples: ["7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d"],
  })
  .pipe(Schema.brand("RecipeUploadId"));

/**
 * Identity of a recipe import and its queued job.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeUploadId = typeof RecipeUploadId.Type;

/**
 * Durable processing state for one recipe import.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUploadStatus = Schema.Literals(["queued", "processing", "succeeded", "failed"]);

/**
 * Durable processing state for one recipe import.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeUploadStatus = typeof RecipeUploadStatus.Type;

/**
 * Stable reason a recipe import could not be completed.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUploadFailureCode = Schema.Literals([
  "page_unavailable",
  "no_recipe_found",
  "ambiguous_recipe",
  "incomplete_recipe",
  "processing_failed",
  "recipe_creation_failed",
  "internal_error",
]);

/**
 * Stable reason a recipe import could not be completed.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeUploadFailureCode = typeof RecipeUploadFailureCode.Type;

/**
 * A recipe to import. The server fetches the page later, never while decoding.
 *
 * @category models
 * @since 0.1.0
 */
export const CreateRecipeUploadRequest = Schema.Struct({
  source: RecipeSource,
}).annotate({
  identifier: "CreateRecipeUploadRequest",
  description: "The page to pull a recipe from, bud.",
  examples: [
    { source: { kind: "url", url: RecipeUrl.make("https://example.com/recipes/pancakes") } },
  ],
});

/**
 * Decoded recipe import input.
 *
 * @category models
 * @since 0.1.0
 */
export interface CreateRecipeUploadRequest extends Schema.Schema.Type<
  typeof CreateRecipeUploadRequest
> {}

/**
 * Public status of a recipe import. Only a succeeded import has a recipe ID,
 * and only a failed one has a failure code.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUpload = Schema.Struct({
  id: RecipeUploadId,
  source: RecipeSource.annotateKey({ description: "The page this import pulls from." }),
  status: RecipeUploadStatus.annotate({
    description: "Where the import is in the play: queued, processing, succeeded, or failed.",
  }),
  recipeId: Schema.NullOr(RecipeId).annotate({
    description: "The recipe this import saved, once it succeeds.",
  }),
  failureCode: Schema.NullOr(RecipeUploadFailureCode).annotate({
    description: "Why the import failed, once it fails; details stay in the server logs.",
  }),
  createdAt: Schema.String.annotate({ description: "When the import came off the bench." }),
  updatedAt: Schema.String.annotate({ description: "When the import's status last changed." }),
})
  .check(
    Schema.makeFilter(
      (upload) => {
        const succeeded = upload.status === "succeeded";
        const failed = upload.status === "failed";
        return (
          ((upload.recipeId !== null) === succeeded && (upload.failureCode !== null) === failed) ||
          "only a succeeded import has a recipe ID and only a failed one has a failure code"
        );
      },
      { toJsonSchema: () => [{}, true] },
    ),
  )
  .annotate({
    identifier: "RecipeUpload",
    description: "A recipe import and how its processing is going.",
    examples: [
      {
        id: RecipeUploadId.make("7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d"),
        source: { kind: "url", url: RecipeUrl.make("https://example.com/recipes/pancakes") },
        status: "succeeded",
        recipeId: RecipeId.make("5"),
        failureCode: null,
        createdAt: "2026-11-08 14:03:11.52+00",
        updatedAt: "2026-11-08 14:03:19.07+00",
      },
    ],
  });

/**
 * Public status of a recipe import.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecipeUpload extends Schema.Schema.Type<typeof RecipeUpload> {}

/**
 * No recipe import has the requested ID.
 *
 * @category errors
 * @since 0.1.0
 */
export class RecipeUploadNotFound extends HttpApiError.Problem<RecipeUploadNotFound>()(
  "RecipeUploadNotFound",
  { type: "goho:problem:recipe-upload-not-found", status: 404, title: "Recipe upload not found" },
  {},
  { description: "No recipe import is wearing that number, bud." },
) {}

/**
 * Only failed recipe imports can be deleted on their own.
 *
 * @category errors
 * @since 0.1.0
 */
export class RecipeUploadConflict extends HttpApiError.Problem<RecipeUploadConflict>()(
  "RecipeUploadConflict",
  {
    type: "goho:problem:recipe-upload-conflict",
    status: 409,
    title: "Recipe upload cannot be deleted",
  },
  {},
  {
    description:
      "Only failed imports can be deleted; this one is queued, processing, or succeeded. Nothing changed.",
  },
) {}

/**
 * Recipe imports could not be stored, read, or deleted; details stay in the
 * server logs.
 *
 * @category errors
 * @since 0.1.0
 */
export class RecipeUploadsUnavailable extends HttpApiError.Problem<RecipeUploadsUnavailable>()(
  "RecipeUploadsUnavailable",
  {
    type: "goho:problem:recipe-uploads-unavailable",
    status: 500,
    title: "Recipe uploads unavailable",
  },
  {},
  { description: "The server could not get to the recipe imports; take another shot." },
) {}
