import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Crypto, Effect, FileSystem, Path, Result } from "effect";
import { expect } from "vitest";

import * as FileStorage from "#src/file-storage.ts";

it.effect("stores, reads, and deletes files in its configured directory", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "goho-storage-test-" });
    const directory = path.join(parent, "uploads");
    const storage = yield* FileStorage.Service.pipe(
      Effect.provide(FileStorage.layerFileSystem({ directory })),
    );
    const bytes = new Uint8Array([9, 8, 7]);

    const fileId = yield* storage.put({
      name: "receipt.png",
      contentType: "image/png",
      bytes,
    });

    expect(yield* fileSystem.readDirectory(directory)).toEqual([fileId]);
    expect([...(yield* storage.get(fileId))]).toEqual([...bytes]);
    yield* storage.delete(fileId);
    expect(yield* fileSystem.exists(path.join(directory, fileId))).toBe(false);
    yield* storage.delete(fileId);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("maps filesystem failures to the storage boundary", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const crypto = yield* Crypto.Crypto;
    const directory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "goho-storage-test-",
    });
    const storage = yield* FileStorage.Service.pipe(
      Effect.provide(FileStorage.layerFileSystem({ directory })),
    );
    const missingFileId = FileStorage.FileId.make(yield* crypto.randomUUIDv4);
    const result = yield* storage.get(missingFileId).pipe(Effect.result);

    expect(Result.isFailure(result) && result.failure).toMatchObject({
      _tag: "GohoServer.FileStorage.StorageError",
      operation: "get",
    });
  }).pipe(Effect.provide(NodeServices.layer)),
);
