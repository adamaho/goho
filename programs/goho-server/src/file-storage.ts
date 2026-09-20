import { GoogleDrive } from "@goho/core";
import { Context, Effect, Layer, Schema, Stream } from "effect";

import { NonEmptyText } from "#src/schema.ts";

/**
 * Opaque identity assigned by the active file storage implementation.
 *
 * @category models
 * @since 0.1.0
 */
export const FileId = NonEmptyText.pipe(Schema.brand("FileId"));

/**
 * Opaque identity assigned by the active file storage implementation.
 *
 * @category models
 * @since 0.1.0
 */
export type FileId = typeof FileId.Type;

/**
 * A file ready to be stored.
 *
 * @category models
 * @since 0.1.0
 */
export const FileToStore = Schema.Struct({
  name: NonEmptyText,
  contentType: NonEmptyText,
  bytes: Schema.Uint8Array,
});

/**
 * A file ready to be stored.
 *
 * @category models
 * @since 0.1.0
 */
export interface FileToStore extends Schema.Schema.Type<typeof FileToStore> {}

/**
 * A failed operation against the active file storage implementation.
 *
 * @category errors
 * @since 0.1.0
 */
export class StorageError extends Schema.TaggedError<StorageError>()(
  "GohoServer.FileStorage.StorageError",
  {
    operation: Schema.Literals(["put", "get"]),
    cause: Schema.Defect(),
  },
) {}

/**
 * Provider-neutral file persistence operations.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly put: (file: FileToStore) => Effect.Effect<FileId, StorageError>;
  readonly get: (fileId: FileId) => Effect.Effect<Uint8Array, StorageError>;
}

/**
 * Service identifier for provider-neutral file persistence.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/FileStorage",
) {}

const storageError = (operation: StorageError["operation"]) =>
  Effect.mapError((cause: unknown) => new StorageError({ operation, cause }));

/**
 * Stores files in one Google Drive folder.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerGoogleDrive = (options: { readonly folderId: string }) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const drive = yield* GoogleDrive.Service;

      const put = Effect.fn("@goho/FileStorage.GoogleDrive.put")(function* (file: FileToStore) {
        const input = yield* Schema.decodeEffect(FileToStore)(file);
        const stored = yield* drive.uploadFile({
          folderId: options.folderId,
          name: input.name,
          mimeType: input.contentType,
          bytes: input.bytes,
        });
        return yield* Schema.decodeEffect(FileId)(stored.id);
      }, storageError("put"));

      const get = Effect.fn("@goho/FileStorage.GoogleDrive.get")(function* (fileId: FileId) {
        return yield* drive.downloadFile({ fileId }).pipe(Stream.mkUint8Array);
      }, storageError("get"));

      return Service.of({ put, get });
    }),
  );
