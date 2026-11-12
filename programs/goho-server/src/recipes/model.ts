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

const startsWith = (bytes: Uint8Array, offset: number, signature: ReadonlyArray<number>) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * A photo's type from its leading bytes, whatever its name or declared type
 * says; null unless it starts like a JPEG, PNG or WebP image. Only the
 * signature is checked, not the whole image.
 *
 * @category models
 * @since 0.1.0
 */
export const sniffPhotoContentType = (bytes: Uint8Array): RecipeImageContentType | null => {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    startsWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return null;
};

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
 * A downloaded or sent recipe photo, not yet stored. Its type comes from its
 * bytes, not the sender's headers.
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
