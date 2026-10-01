import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";

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
    operation: Schema.Literals(["put", "get", "delete"]),
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
  /** Succeeds when the file is already absent, so cleanup can be retried. */
  readonly delete: (fileId: FileId) => Effect.Effect<void, StorageError>;
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
 * Stores files in one local filesystem directory.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerFileSystem = (options: { readonly directory: string }) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      yield* fileSystem.makeDirectory(options.directory, { recursive: true, mode: 0o700 });

      const storedPath = (fileId: FileId) => path.join(options.directory, fileId);

      const put = Effect.fn("@goho/FileStorage.FileSystem.put")(function* (file: FileToStore) {
        const input = yield* Schema.decodeEffect(FileToStore)(file);
        const fileId = yield* Schema.decodeEffect(FileId)(yield* crypto.randomUUIDv4);
        yield* fileSystem.writeFile(storedPath(fileId), input.bytes, {
          flag: "wx",
          mode: 0o600,
        });
        return fileId;
      }, storageError("put"));

      const get = Effect.fn("@goho/FileStorage.FileSystem.get")(function* (fileId: FileId) {
        return yield* fileSystem.readFile(storedPath(fileId));
      }, storageError("get"));

      const deleteFile = Effect.fn("@goho/FileStorage.FileSystem.deleteFile")(function* (
        fileId: FileId,
      ) {
        yield* fileSystem.remove(storedPath(fileId), { force: true });
      }, storageError("delete"));

      return Service.of({ put, get, delete: deleteFile });
    }),
  );
