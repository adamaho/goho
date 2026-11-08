import { Schema } from "effect";

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
