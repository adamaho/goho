import { RecipeUploadFailureCode } from "@goho/goho-api/recipe-uploads";
import type { CreateRecipeRequest } from "@goho/goho-api/recipes";
import { type Option, Schema } from "effect";

import { FileId } from "#src/services/file-storage.ts";

/**
 * MIME types a stored recipe photo can have.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeImageContentType = Schema.Literals(["image/jpeg", "image/png", "image/webp"]);

/**
 * MIME type of a stored recipe photo.
 *
 * @category models
 * @since 0.1.0
 */
export type RecipeImageContentType = typeof RecipeImageContentType.Type;

/**
 * A recipe photo already in file storage: its file ID and MIME type.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeImage = Schema.Struct({
  fileId: FileId,
  contentType: RecipeImageContentType,
});

/**
 * A recipe photo already in file storage.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecipeImage extends Schema.Schema.Type<typeof RecipeImage> {}

/**
 * Why a recipe could not be imported from its page, as the upload failure code
 * to record. `retryable` is true when a later attempt can plausibly succeed: a
 * temporary page or AI failure. Rejections of the page's content never are.
 *
 * @category errors
 * @since 0.1.0
 */
export class ImportError extends Schema.TaggedError<ImportError>()(
  "GohoServer.Recipes.ImportError",
  {
    failureCode: RecipeUploadFailureCode.pick([
      "page_unavailable",
      "no_recipe_found",
      "ambiguous_recipe",
      "incomplete_recipe",
      "processing_failed",
    ]),
    retryable: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {}

/**
 * What a fetched recipe page offers the extraction: its title and description,
 * any schema.org Recipe objects from JSON-LD, its visible text, and a photo
 * URL. Every value is untrusted page content.
 *
 * @category models
 * @since 0.1.0
 */
export interface PageContent {
  readonly title: string | null;
  readonly description: string | null;
  readonly structuredRecipes: ReadonlyArray<unknown>;
  readonly text: string;
  /** Absolute http or https photo URL, resolved against the page's final URL. */
  readonly imageUrl: string | null;
}

/**
 * A downloaded recipe photo, not yet stored. Its type comes from its bytes,
 * not the server's headers.
 *
 * @category models
 * @since 0.1.0
 */
export interface Photo {
  readonly bytes: Uint8Array;
  readonly contentType: RecipeImageContentType;
}

/**
 * A recipe read from its page, with the page's photo when one downloaded.
 *
 * @category models
 * @since 0.1.0
 */
export interface ImportedRecipe {
  readonly recipe: CreateRecipeRequest;
  readonly photo: Option.Option<Photo>;
}
