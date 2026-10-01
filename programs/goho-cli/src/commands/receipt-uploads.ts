import {
  ReceiptUploadId,
  type ReceiptUploadContentType,
} from "@goho/goho-server-client/receipt-uploads";
import { Console, Effect, FileSystem, Path } from "effect";
import { Argument, Command } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

const contentTypeForExtension = (extension: string) => {
  switch (extension) {
    case ".jpeg":
    case ".jpg":
      return "image/jpeg" satisfies ReceiptUploadContentType;
    case ".png":
      return "image/png" satisfies ReceiptUploadContentType;
    case ".webp":
      return "image/webp" satisfies ReceiptUploadContentType;
    default:
      return undefined;
  }
};

const readReceiptFile = Effect.fn("@goho/ReceiptUploads.readReceiptFile")(function* (
  filePath: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypeForExtension(extension);
  if (contentType === undefined) {
    return yield* new CommandError({
      message: "Receipt must be a JPEG, PNG, or WebP image.",
      cause: extension,
    });
  }
  const bytes = yield* fileSystem.readFile(filePath).pipe(
    Effect.mapError(
      (cause) =>
        new CommandError({
          message: `Receipt file could not be read: ${filePath}`,
          cause,
        }),
    ),
  );
  return { bytes, contentType, fileName: path.basename(filePath) };
});

/**
 * Uploads one receipt image for asynchronous processing.
 *
 * @category commands
 * @since 0.1.0
 */
export const uploadCommand = Command.make("upload", {
  filePath: Argument.String("path").pipe(
    Argument.withDescription("Path to one JPEG, PNG, or WebP receipt image."),
  ),
}).pipe(
  Command.withDescription("Upload one receipt image for processing."),
  Command.withHandler(({ filePath }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const file = yield* readReceiptFile(filePath);
      const payload = new FormData();
      payload.set("file", new File([file.bytes], file.fileName, { type: file.contentType }));
      const response = yield* client.receiptUploads.create({ payload }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              message:
                cause._tag === "BadRequest"
                  ? "Receipt must be a JPEG, PNG, or WebP image no larger than 20 MB."
                  : "Receipt could not be uploaded. Check the server logs and try again.",
              cause,
            }),
        ),
      );
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
);

/**
 * Retrieves the durable processing status of one receipt upload.
 *
 * @category commands
 * @since 0.1.0
 */
export const statusCommand = Command.make("status", {
  uploadId: Argument.String("upload-id").pipe(
    Argument.withSchema(ReceiptUploadId),
    Argument.withDescription("UUID returned when the receipt was uploaded."),
  ),
}).pipe(
  Command.withDescription("Show the processing status of one receipt upload."),
  Command.withHandler(({ uploadId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.receiptUploads.get({ params: { uploadId } });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CommandError({
            message:
              cause._tag === "NotFound"
                ? `Receipt upload ${uploadId} was not found.`
                : "Receipt upload status could not be retrieved. Check the server logs and try again.",
            cause,
          }),
      ),
    ),
  ),
);
