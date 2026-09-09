import { drive, type drive_v3 } from "@googleapis/drive";
import { Context, Effect, Layer, Schema, Stream } from "effect";

import * as GoogleAuth from "./auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Metadata for a file returned by Google Drive.
 *
 * @category models
 * @since 0.1.0
 */
export interface FileMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
}

/**
 * Metadata for a folder returned by Google Drive.
 *
 * @category models
 * @since 0.1.0
 */
export interface FolderMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
}

/**
 * Options for listing immediate child folders.
 *
 * @category models
 * @since 0.1.0
 */
export interface ListFoldersOptions {
  readonly folderId: string;
}

/**
 * Options for listing immediate child files.
 *
 * @category models
 * @since 0.1.0
 */
export interface ListFilesOptions {
  readonly folderId: string;
}

/**
 * Options for downloading a Drive file.
 *
 * @category models
 * @since 0.1.0
 */
export interface DownloadFileOptions {
  readonly fileId: string;
}

/**
 * Options for moving a file between Drive folders.
 *
 * @category models
 * @since 0.1.0
 */
export interface MoveFileOptions {
  readonly fileId: string;
  readonly sourceFolderId: string;
  readonly destinationFolderId: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Describes a failed Google Drive operation.
 *
 * @category errors
 * @since 0.1.0
 */
export class DriveError extends Schema.TaggedError<DriveError>()("GoogleDrive.DriveError", {
  operation: Schema.Literals(["listFolders", "listFiles", "downloadFile", "moveFile"]),
  message: Schema.String,
}) {}

type Operation = "listFolders" | "listFiles" | "downloadFile" | "moveFile";

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Returns a safe message for an unknown Drive client failure.
 *
 * @param error - The value caught at the Drive client boundary.
 * @returns A message suitable for the typed Drive error.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google Drive request failed";
}

/**
 * Converts an unknown Drive client failure to the service error type.
 *
 * @param operation - The Drive operation that failed.
 * @param error - The value caught at the Drive client boundary.
 * @returns A typed Drive service error.
 */
function clientError(operation: Operation, error: unknown): DriveError {
  return new DriveError({
    operation,
    message: errorMessage(error),
  });
}

/**
 * Validates and narrows metadata returned by the Drive API.
 *
 * @param operation - The Drive operation requesting the metadata.
 * @param file - The generated client's file response.
 * @returns Valid metadata or an error describing an incomplete response.
 */
function fileMetadata(operation: Operation, file: drive_v3.Schema$File): FileMetadata | DriveError {
  if (
    file.id === null ||
    file.id === undefined ||
    file.name === null ||
    file.name === undefined ||
    file.mimeType === null ||
    file.mimeType === undefined
  ) {
    return new DriveError({
      operation,
      message: "Google Drive returned incomplete file metadata",
    });
  }

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
  };
}

/**
 * Escapes a value for use as a string literal in a Drive query.
 *
 * @param value - The untrusted query value.
 * @returns The escaped query value.
 */
function queryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

/**
 * Creates a Drive query for immediate file or folder children.
 *
 * @param folderId - The parent Google Drive folder ID.
 * @param kind - Whether to return files or folders.
 * @returns An escaped Google Drive query.
 */
function childrenQuery(folderId: string, kind: "files" | "folders"): string {
  const mimeTypeOperator = kind === "folders" ? "=" : "!=";
  return `'${queryValue(folderId)}' in parents and trashed = false and mimeType ${mimeTypeOperator} 'application/vnd.google-apps.folder'`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------------------

/**
 * File and folder operations exposed by the Google Drive service.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly listFolders: (
    options: ListFoldersOptions,
  ) => Effect.Effect<ReadonlyArray<FolderMetadata>, DriveError>;
  readonly listFiles: (
    options: ListFilesOptions,
  ) => Effect.Effect<ReadonlyArray<FileMetadata>, DriveError>;
  readonly downloadFile: (options: DownloadFileOptions) => Stream.Stream<Uint8Array, DriveError>;
  readonly moveFile: (options: MoveFileOptions) => Effect.Effect<FileMetadata, DriveError>;
}

/**
 * Service identifier for Google Drive operations.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/google/Drive") {}

/**
 * Constructs the Google Drive service.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const auth = yield* GoogleAuth.Service;
  const client = drive("v3");

  const listFolders = Effect.fn("@goho/GoogleDrive.listFolders")(function* (
    options: ListFoldersOptions,
  ) {
    const headers = yield* auth
      .getRequestHeaders()
      .pipe(Effect.mapError((error) => clientError("listFolders", error)));

    const folders: Array<FolderMetadata> = [];
    let pageToken: string | undefined;

    do {
      const response = yield* Effect.tryPromise({
        try: (signal) => {
          const params: drive_v3.Params$Resource$Files$List = {
            q: childrenQuery(options.folderId, "folders"),
            pageSize: 1000,
            orderBy: "name",
            fields: "nextPageToken,files(id,name,mimeType)",
            spaces: "drive",
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
          };
          if (pageToken !== undefined) {
            params.pageToken = pageToken;
          }
          return client.files.list(params, { headers, signal });
        },
        catch: (error) => clientError("listFolders", error),
      });

      for (const folder of response.data.files ?? []) {
        const metadata = fileMetadata("listFolders", folder);
        if (metadata instanceof DriveError) {
          return yield* metadata;
        }
        folders.push(metadata);
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken !== undefined);

    return folders;
  });

  const listFiles = Effect.fn("@goho/GoogleDrive.listFiles")(function* (options: ListFilesOptions) {
    const headers = yield* auth
      .getRequestHeaders()
      .pipe(Effect.mapError((error) => clientError("listFiles", error)));
    const files: Array<FileMetadata> = [];
    let pageToken: string | undefined;

    do {
      const response = yield* Effect.tryPromise({
        try: (signal) => {
          const params: drive_v3.Params$Resource$Files$List = {
            q: childrenQuery(options.folderId, "files"),
            pageSize: 1000,
            orderBy: "name",
            fields: "nextPageToken,files(id,name,mimeType)",
            spaces: "drive",
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
          };
          if (pageToken !== undefined) {
            params.pageToken = pageToken;
          }
          return client.files.list(params, { headers, signal });
        },
        catch: (error) => clientError("listFiles", error),
      });

      for (const file of response.data.files ?? []) {
        const metadata = fileMetadata("listFiles", file);
        if (metadata instanceof DriveError) {
          return yield* metadata;
        }

        files.push(metadata);
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken !== undefined);

    return files;
  });

  /**
   * Opens a file download as an Effect stream.
   *
   * @param options - The Google Drive file to download.
   * @returns A stream of file content chunks.
   */
  function downloadFile(options: DownloadFileOptions): Stream.Stream<Uint8Array, DriveError> {
    return Stream.unwrap(
      Effect.gen(function* () {
        const headers = yield* auth
          .getRequestHeaders()
          .pipe(Effect.mapError((error) => clientError("downloadFile", error)));

        const response = yield* Effect.tryPromise({
          try: (signal) =>
            client.files.get(
              {
                fileId: options.fileId,
                alt: "media",
                supportsAllDrives: true,
              },
              { headers, responseType: "stream", signal },
            ),
          catch: (error) => clientError("downloadFile", error),
        });

        return Stream.fromAsyncIterable<unknown, DriveError>(response.data, (error) =>
          clientError("downloadFile", error),
        ).pipe(
          Stream.mapEffect((chunk) => {
            if (chunk instanceof Uint8Array) {
              return Effect.succeed(chunk);
            }
            return Effect.fail(
              new DriveError({
                operation: "downloadFile",
                message: "Google Drive returned non-binary file data",
              }),
            );
          }),
        );
      }),
    );
  }

  const moveFile = Effect.fn("@goho/GoogleDrive.moveFile")(function* (options: MoveFileOptions) {
    const headers = yield* auth
      .getRequestHeaders()
      .pipe(Effect.mapError((error) => clientError("moveFile", error)));

    const response = yield* Effect.tryPromise({
      try: (signal) =>
        client.files.update(
          {
            fileId: options.fileId,
            addParents: options.destinationFolderId,
            removeParents: options.sourceFolderId,
            supportsAllDrives: true,
            fields: "id,name,mimeType",
          },
          { headers, signal },
        ),
      catch: (error) => clientError("moveFile", error),
    });
    const metadata = fileMetadata("moveFile", response.data);

    if (metadata instanceof DriveError) {
      return yield* metadata;
    }

    return metadata;
  });

  return Service.of({ listFolders, listFiles, downloadFile, moveFile });
});

/**
 * Provides Google Drive operations using the configured authentication service.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make);
