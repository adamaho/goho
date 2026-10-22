import { BookUploadId, type BookUploadContentType } from "@goho/goho-server-client/book-uploads";
import { Console, Effect, FileSystem, Path } from "effect";
import { Argument, Command } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

const contentTypeForExtension = (extension: string) => {
  switch (extension) {
    case ".jpeg":
    case ".jpg":
      return "image/jpeg" satisfies BookUploadContentType;
    case ".png":
      return "image/png" satisfies BookUploadContentType;
    case ".webp":
      return "image/webp" satisfies BookUploadContentType;
    default:
      return undefined;
  }
};

const readCoverFile = Effect.fn("@goho/BookUploads.readCoverFile")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypeForExtension(extension);
  if (contentType === undefined) {
    return yield* new CommandError({
      message: "Book cover must be a JPEG, PNG, or WebP image.",
      cause: extension,
    });
  }
  const bytes = yield* fileSystem.readFile(filePath).pipe(
    Effect.mapError(
      (cause) =>
        new CommandError({
          message: `Book cover file could not be read: ${filePath}`,
          cause,
        }),
    ),
  );
  return { bytes, contentType, fileName: path.basename(filePath) };
});

/**
 * Uploads one book cover image for asynchronous processing.
 *
 * @category commands
 * @since 0.1.0
 */
export const uploadCommand = Command.make("upload", {
  filePath: Argument.String("path").pipe(
    Argument.withDescription("Path to one JPEG, PNG, or WebP book cover image."),
  ),
}).pipe(
  Command.withDescription("Upload one book cover image for processing."),
  Command.withHandler(({ filePath }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const file = yield* readCoverFile(filePath);
      const payload = new FormData();
      payload.set("file", new File([file.bytes], file.fileName, { type: file.contentType }));
      const response = yield* client.bookUploads.create({ payload }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                cause._tag === "BadRequest"
                  ? "Book cover must be a JPEG, PNG, or WebP image no larger than 20 MB."
                  : "Book cover could not be uploaded. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
);

/**
 * Retrieves the durable processing status of one book cover upload.
 *
 * @category commands
 * @since 0.1.0
 */
export const statusCommand = Command.make("status", {
  uploadId: Argument.String("upload-id").pipe(
    Argument.withSchema(BookUploadId),
    Argument.withDescription("UUID returned when the book cover was uploaded."),
  ),
}).pipe(
  Command.withDescription("Show the processing status of one book cover upload."),
  Command.withHandler(({ uploadId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.bookUploads.get({ params: { uploadId } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "BookUploadNotFound"
                ? `Book upload ${uploadId} was not found.`
                : "Book upload status could not be retrieved. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);
