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
      message: `${label} must be a JPEG, PNG, or WebP image.`,
      cause: extension,
    });
  }
  const bytes = yield* fileSystem.readFile(filePath).pipe(
    Effect.mapError(
      (cause) =>
        new CommandError({
          message: `${label} file could not be read: ${filePath}`,
          cause,
        }),
    ),
  );
  return { bytes, contentType, fileName: path.basename(filePath) };
});
