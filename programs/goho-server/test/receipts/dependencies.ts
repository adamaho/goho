import { Ai, GoogleDrive, GoogleSheets } from "@goho/core";
import { Effect, Layer, Schema, Stream } from "effect";

import * as Workflow from "#src/receipts/process.ts";
import * as Repository from "#src/receipts/repository.ts";

import { parsedReceipt } from "./fixtures.ts";

/**
 * Provides controlled receipt dependencies shared by HTTP and service tests.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (
  overrides: {
    readonly googleDrive?: Partial<GoogleDrive.Interface>;
    readonly googleSheets?: Partial<GoogleSheets.Interface>;
    readonly repository?: Partial<Repository.Interface>;
  } = {},
) =>
  Layer.mergeAll(
    Layer.succeed(GoogleDrive.Service, {
      listFolders: () =>
        Effect.succeed(
          Workflow.requiredFolders.map((name) => ({
            id: name,
            name,
            mimeType: "application/vnd.google-apps.folder",
          })),
        ),
      listFiles: () => Effect.succeed([]),
      downloadFile: () => Stream.make(new Uint8Array([1])),
      moveFile: ({ fileId }) =>
        Effect.succeed({ id: fileId, name: "receipt.png", mimeType: "image/png" }),
      ...overrides.googleDrive,
    }),
    Layer.succeed(GoogleSheets.Service, {
      readRows: () => Effect.succeed([["source_file_id"]]),
      appendRows: () => Effect.succeed({}),
      ...overrides.googleSheets,
    }),
    Layer.succeed(Ai.Service, {
      generateObject: ({ schema }) =>
        Schema.decodeUnknownEffect(schema)(parsedReceipt).pipe(Effect.orDie),
    }),
    Layer.succeed(Repository.Service, {
      create: () => Effect.die("Unexpected repository.create call in processing test"),
      save: () =>
        Effect.succeed({
          _tag: "Inserted",
          receiptId: "00000000-0000-4000-8000-000000000001",
        } satisfies Repository.SaveResult),
      ...overrides.repository,
    }),
  );
