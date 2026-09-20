import { it } from "@effect/vitest";
import { GoogleDrive } from "@goho/core";
import { Effect, Layer, Ref, Result, Stream } from "effect";
import { expect } from "vitest";

import * as FileStorage from "#src/file-storage.ts";

const driveLayer = (overrides: Partial<GoogleDrive.Interface>) =>
  Layer.succeed(GoogleDrive.Service, {
    listFolders: () => Effect.die("Unexpected listFolders call"),
    listFiles: () => Effect.die("Unexpected listFiles call"),
    uploadFile: () => Effect.die("Unexpected uploadFile call"),
    downloadFile: () => Stream.die("Unexpected downloadFile call"),
    moveFile: () => Effect.die("Unexpected moveFile call"),
    ...overrides,
  });

it.effect("adapts Google Drive upload and download operations", () =>
  Effect.gen(function* () {
    const uploads = yield* Ref.make<ReadonlyArray<GoogleDrive.UploadFileOptions>>([]);
    const downloads = yield* Ref.make<ReadonlyArray<string>>([]);
    const googleDrive = driveLayer({
      uploadFile: (options) =>
        Ref.update(uploads, (all) => [...all, options]).pipe(
          Effect.as({ id: "drive-file", name: options.name, mimeType: options.mimeType }),
        ),
      downloadFile: ({ fileId }) =>
        Stream.fromEffect(Ref.update(downloads, (all) => [...all, fileId])).pipe(
          Stream.flatMap(() => Stream.make(new Uint8Array([1, 2]), new Uint8Array([3, 4]))),
        ),
    });
    const storage = yield* FileStorage.Service.pipe(
      Effect.provide(
        FileStorage.layerGoogleDrive({ folderId: "receipt-folder" }).pipe(
          Layer.provide(googleDrive),
        ),
      ),
    );
    const bytes = new Uint8Array([9, 8, 7]);

    const fileId = yield* storage.put({
      name: "receipt.png",
      contentType: "image/png",
      bytes,
    });

    expect(fileId).toBe("drive-file");
    expect(yield* Ref.get(uploads)).toEqual([
      {
        folderId: "receipt-folder",
        name: "receipt.png",
        mimeType: "image/png",
        bytes,
      },
    ]);
    expect(yield* storage.get(fileId)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(yield* Ref.get(downloads)).toEqual(["drive-file"]);
  }),
);

it.effect("maps Google Drive failures to the storage boundary", () =>
  Effect.gen(function* () {
    const storage = yield* FileStorage.Service.pipe(
      Effect.provide(
        FileStorage.layerGoogleDrive({ folderId: "receipt-folder" }).pipe(
          Layer.provide(
            driveLayer({
              uploadFile: () =>
                Effect.fail(
                  new GoogleDrive.DriveError({
                    operation: "uploadFile",
                    message: "provider details",
                  }),
                ),
            }),
          ),
        ),
      ),
    );
    const result = yield* storage
      .put({ name: "receipt.png", contentType: "image/png", bytes: new Uint8Array([1]) })
      .pipe(Effect.result);

    expect(Result.isFailure(result) && result.failure).toMatchObject({
      _tag: "GohoServer.FileStorage.StorageError",
      operation: "put",
    });
  }),
);
