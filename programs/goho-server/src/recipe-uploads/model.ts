import type { RecipeUpload } from "@goho/goho-api/recipe-uploads";

/**
 * An import found by its source, and whether this call created it.
 *
 * @category models
 * @since 0.1.0
 */
export interface FoundOrCreated {
  readonly upload: RecipeUpload;
  /** True only when this call inserted the upload; a reused one needs no new job. */
  readonly created: boolean;
}
