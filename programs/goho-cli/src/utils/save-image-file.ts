import { Effect, FileSystem, Option } from "effect";

import { CommandError } from "#src/errors.ts";

const getImageExtension = (contentType: string) => {
  switch (contentType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return undefined;
  }
};

/**
 * Saves one downloaded image and describes the saved file. Without `output` the
 * file is named `defaultName` plus the extension for its type, in the current
 * directory. An existing file is only replaced when `clobber` is set. `label`
 * names the image in failure messages, such as `"Book cover"`.
 *
 * @category utils
 * @since 0.1.0
 */
export const saveImageFile = Effect.fn("@goho/Utils.saveImageFile")(function* (options: {
  readonly label: string;
  readonly defaultName: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly output: Option.Option<string>;
  readonly clobber: boolean;
}) {
  const { bytes, clobber, contentType, defaultName, label, output } = options;
  const fileSystem = yield* FileSystem.FileSystem;
  const extension = getImageExtension(contentType);
  if (Option.isNone(output) && extension === undefined) {
    return yield* new CommandError({
      message: `${label} has an unexpected type, ${contentType}. Choose a file name with --output.`,
      cause: contentType,
    });
  }
  const path = Option.getOrElse(output, () => `${defaultName}${extension}`);
  // "wx" fails on an existing file, so a check can't race the write.
  yield* fileSystem.writeFile(path, bytes, { flag: clobber ? "w" : "wx" }).pipe(
    Effect.mapError(
      (cause) =>
        new CommandError({
          message:
            cause.reason._tag === "AlreadyExists"
              ? `${path} already exists. Pass --clobber to replace it.`
              : `${label} could not be saved to ${path}.`,
          cause,
        }),
    ),
  );
  return { path, contentType, sizeBytes: bytes.length };
});
