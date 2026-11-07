import { Effect, FileSystem, Path } from "effect";

import { CommandError } from "#src/errors.ts";

import { getImageContentType } from "./get-image-content-type.ts";

/**
 * Reads one JPEG, PNG, or WebP image for upload. `label` names the image in
 * failure messages, such as `"Receipt"` or `"Book cover"`.
 *
 * @category utils
 * @since 0.1.0
 */
export const readImageFile = Effect.fn("@goho/Utils.readImageFile")(function* (
  label: string,
  filePath: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const extension = path.extname(filePath).toLowerCase();
  const contentType = getImageContentType(extension);
  if (contentType === undefined) {
    return yield* new CommandError({
      type: "goho:cli:invalid-input",
      detail: `${label} must be a JPEG, PNG, or WebP image.`,
    });
  }
  const bytes = yield* fileSystem.readFile(filePath).pipe(
    Effect.mapError(
      () =>
        new CommandError({
          type: "goho:cli:file-error",
          detail: `${label} file could not be read: ${filePath}`,
        }),
    ),
  );
  return { bytes, contentType, fileName: path.basename(filePath) };
});
