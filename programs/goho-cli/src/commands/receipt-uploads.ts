import { ReceiptUploadId } from "@goho/goho-server-client/receipt-uploads";
import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import * as GohoServer from "#src/goho-server.ts";
import { DeleteResult } from "#src/response.ts";
import { readImageFile } from "#src/utils/read-image-file.ts";

/**
 * Uploads one receipt image for asynchronous processing.
 *
 * @category commands
 * @since 0.1.0
 */
const createCommand = Command.make("create", {
  filePath: Argument.String("path").pipe(
    Argument.withDescription("Path to one JPEG, PNG, or WebP receipt image."),
  ),
}).pipe(
  Command.withDescription("Upload one receipt image for processing."),
  Command.withHandler(({ filePath }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const file = yield* readImageFile("Receipt", filePath);
      const payload = new FormData();
      payload.set("file", new File([file.bytes], file.fileName, { type: file.contentType }));
      const response = yield* client.receiptUploads.create({ payload });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Retrieves the durable processing status of one receipt upload.
 *
 * @category commands
 * @since 0.1.0
 */
const viewCommand = Command.make("view", {
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
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Lists every receipt upload and its current processing status.
 *
 * @category commands
 * @since 0.1.0
 */
const listCommand = Command.make("list").pipe(
  Command.withDescription("List all receipt uploads and their processing status."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      const response = yield* client.receiptUploads.list();
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Deletes one failed receipt upload and its stored image.
 *
 * @category commands
 * @since 0.1.0
 */
const deleteCommand = Command.make("delete", {
  uploadId: Argument.String("upload-id").pipe(
    Argument.withSchema(ReceiptUploadId),
    Argument.withDescription("UUID of the failed receipt upload to delete."),
  ),
}).pipe(
  Command.withDescription("Permanently delete one failed receipt upload and its stored image."),
  Command.withHandler(({ uploadId }) =>
    Effect.gen(function* () {
      const client = yield* GohoServer.Service;
      yield* client.receiptUploads.delete({ params: { uploadId } });
      const result = yield* DeleteResult.makeEffect({
        deleted: true,
        resource: "receipt-upload",
        id: uploadId,
      });
      yield* Console.log(JSON.stringify(result, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);

/**
 * Groups receipt upload creation, listing, viewing, and failed-upload deletion.
 *
 * @category commands
 * @since 0.1.0
 */
export const uploadsCommand = Command.make("uploads").pipe(
  Command.withDescription("Manage receipt uploads and their processing status."),
  Command.withSubcommands([createCommand, listCommand, viewCommand, deleteCommand]),
);
