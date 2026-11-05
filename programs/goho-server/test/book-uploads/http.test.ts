import { NodeCrypto, NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { api } from "@goho/goho-api/api";
import {
  BookUpload,
  BookUploadConflict,
  BookUploadId,
  BookUploadNotFound,
  BookUploadsUnavailable,
} from "@goho/goho-api/book-uploads";
import { BookId } from "@goho/goho-api/books";
import { UploadLimitExceeded } from "@goho/goho-api/response";
import * as Client from "@goho/goho-server-client/client";
import { Effect, FileSystem, Layer, PlatformError } from "effect";
import { HttpBody, HttpClient, type HttpClientResponse, HttpRouter } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { PersistedQueue } from "effect/persistence";
import { expect } from "vitest";

import * as BookUploadQueue from "#src/book-uploads/queue.ts";
import * as BookUploadRepository from "#src/book-uploads/repository.ts";
import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";

const bookUpload = BookUpload.make({
  id: BookUploadId.make("3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b"),
  fileName: "cover.webp",
  contentType: "image/webp",
  status: "succeeded",
  bookId: BookId.make("12"),
  failureCode: null,
  createdAt: "2026-10-20 14:00:00+00",
  updatedAt: "2026-10-20 14:00:09+00",
});

// Records what reaches the service, so boundary rejections can prove nothing did.
const testLayer = (uploads: Partial<BookUploads.Interface> = {}) => {
  const calls: Array<unknown> = [];
  const layer = HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide([
        Layer.succeed(
          BookUploads.Service,
          BookUploads.Service.of({
            create: (input) =>
              Effect.sync(() => {
                calls.push(["create", { ...input, bytes: [...input.bytes] }]);
                return bookUpload;
              }),
            delete: (uploadId) =>
              Effect.sync(() => {
                calls.push(["delete", uploadId]);
              }),
            get: (uploadId) =>
              Effect.sync(() => {
                calls.push(["get", uploadId]);
                return bookUpload;
              }),
            list: Effect.sync(() => {
              calls.push(["list"]);
              return [bookUpload];
            }),
            ...uploads,
          }),
        ),
        Layer.mock(Books.Service, {}),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(ReceiptUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return { calls, layer };
};

const coverForm = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

it.effect("uploads, lists, gets, and deletes cover scans through the generated client", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    const form = coverForm(
      new File([new Uint8Array([1, 2, 3])], "cover.webp", { type: "image/webp" }),
    );
    expect(yield* client.bookUploads.create({ payload: form })).toEqual({ data: bookUpload });
    const accepted = yield* HttpClient.post("/book-uploads", { body: HttpBody.formData(form) });
    expect(accepted.status).toBe(202);
    expect(yield* client.bookUploads.list()).toEqual({ data: [bookUpload] });
    expect(yield* client.bookUploads.get({ params: { uploadId: bookUpload.id } })).toEqual({
      data: bookUpload,
    });
    const deleted = yield* HttpClient.del(`/book-uploads/${bookUpload.id}`);
    expect(deleted.status).toBe(204);
    expect(yield* deleted.text).toBe("");
    const upload = { name: "cover.webp", contentType: "image/webp", bytes: [1, 2, 3] };
    expect(calls).toEqual([
      ["create", upload],
      ["create", upload],
      ["list"],
      ["get", bookUpload.id],
      ["delete", bookUpload.id],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("rejects unsupported and malformed cover uploads before the service", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    for (const file of [
      new File(["not an image"], "cover.txt", { type: "text/plain" }),
      new File([new Uint8Array([1])], "cover.gif", { type: "image/gif" }),
    ]) {
      const response = yield* HttpClient.post("/book-uploads", {
        body: HttpBody.formData(coverForm(file)),
      });
      expect(response.status, file.name).toBe(400);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(yield* response.json).toEqual({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Send one JPEG, PNG, or WebP image with a nonblank file name.",
      });
    }
    for (const request of [
      HttpClient.get("/book-uploads/not-a-uuid"),
      HttpClient.del("/book-uploads/not-a-uuid"),
    ]) {
      const response = yield* request;
      expect(response.status).toBe(400);
      expect(yield* response.json).toEqual({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
      });
    }
    expect(calls).toEqual([]);
  }).pipe(Effect.provide(layer));
});

// Uses a real socket for both raw HTTP and typed-client size-limit rejections.
// Its own server keeps connection resets away from unrelated requests.
it.live(
  "rejects covers over the shared size and part limits before the service",
  () => {
    const { calls, layer } = testLayer();
    return Effect.gen(function* () {
      const image = (size: number, name = "cover.png") =>
        new File([new Uint8Array(size)], name, { type: "image/png" });
      const tooManyParts = coverForm(image(1));
      tooManyParts.append("file", image(1, "second.png"));
      const oversizedField = new FormData();
      oversizedField.append("file", "x".repeat(10 * 1024 * 1024 + 1));
      const client = yield* Client.make("");
      for (const [limit, form] of [
        ["file size", coverForm(image(20 * 1024 * 1024 + 1))],
        ["part count", tooManyParts],
        ["field size", oversizedField],
      ] as const) {
        const response = yield* HttpClient.post("/book-uploads", {
          body: HttpBody.formData(form),
        });
        expect(response.status, limit).toBe(413);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        expect(yield* response.json).toEqual({
          type: "goho:problem:upload-limit-exceeded",
          status: 413,
          title: "Upload limit exceeded",
          detail:
            "Upload exceeds a multipart limit. Send one image up to 20 MB with a total request up to 21 MB.",
        });
        const failure = yield* client.bookUploads.create({ payload: form }).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(UploadLimitExceeded);
      }
      expect(calls).toEqual([]);
    }).pipe(Effect.provide(layer));
  },
  15_000,
);

const privateDetails = "private SQL and /private/path details";
const repositoryFailure = new BookUploadRepository.PersistenceError({
  operation: "test",
  cause: privateDetails,
});
const storageFailure = (operation: "put" | "delete") =>
  new FileStorage.StorageError({ operation, cause: privateDetails });
const storedFile = FileStorage.FileId.make("stored-cover");

// The real upload service over fake persistence, so failures take the production mapping.
const serviceLayer = (
  repository: Partial<BookUploadRepository.Interface>,
  storage: Partial<FileStorage.Interface> = {},
  queue: Partial<BookUploadQueue.Service["Service"]> = {},
  // Multipart parsing keeps the real file system; only the handler's temp read is replaced.
  readFile?: FileSystem.FileSystem["readFile"],
  transaction = Transaction.layerTest,
) =>
  HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide(
        Layer.effect(
          FileSystem.FileSystem,
          Effect.gen(function* () {
            const fileSystem = yield* FileSystem.FileSystem;
            return readFile === undefined ? fileSystem : { ...fileSystem, readFile };
          }),
        ).pipe(Layer.provide(NodeFileSystem.layer)),
      ),
      Layer.provide([
        BookUploads.layer.pipe(
          Layer.provide([
            transaction,
            NodeCrypto.layer,
            Layer.mock(BookUploadQueue.Service, queue),
            Layer.mock(FileStorage.Service, storage),
            Layer.mock(BookUploadRepository.Service, repository),
          ]),
        ),
        Layer.mock(Books.Service, {}),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(ReceiptUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const problem = (error: unknown, type: string, status: number, title: string) => ({
  error,
  status,
  body: { type: `goho:problem:${type}`, status, title },
});
const uploadNotFound = problem(
  BookUploadNotFound,
  "book-upload-not-found",
  404,
  "Book upload not found",
);
const uploadConflict = problem(
  BookUploadConflict,
  "book-upload-conflict",
  409,
  "Book upload cannot be deleted",
);
const uploadsUnavailable = problem(
  BookUploadsUnavailable,
  "book-uploads-unavailable",
  500,
  "Book uploads unavailable",
);

const uploadParams = { params: { uploadId: bookUpload.id } };
const uploadForm = () =>
  coverForm(new File([new Uint8Array([1])], "cover.png", { type: "image/png" }));

// Upload handoff steps a create reached, in order, for the no-write assertions below.
const recordCreateSteps = (failing: {
  readonly createQueued?: boolean;
  readonly offer?: boolean;
  readonly cleanup?: boolean;
}) => {
  const steps: Array<string> = [];
  const step = (name: string) =>
    Effect.sync(() => {
      steps.push(name);
    });
  return {
    steps,
    repository: {
      createQueued: () =>
        step("createQueued").pipe(
          Effect.andThen(
            failing.createQueued
              ? Effect.fail(repositoryFailure)
              : Effect.succeed({ ...bookUpload, fileId: storedFile }),
          ),
        ),
    } satisfies Partial<BookUploadRepository.Interface>,
    storage: {
      put: () => step("put").pipe(Effect.as(storedFile)),
      delete: () =>
        step("delete").pipe(
          Effect.andThen(failing.cleanup ? Effect.fail(storageFailure("delete")) : Effect.void),
        ),
    } satisfies Partial<FileStorage.Interface>,
    queue: {
      offer: () =>
        step("offer").pipe(
          Effect.andThen(
            failing.offer
              ? Effect.fail(new PersistedQueue.PersistedQueueError({ message: privateDetails }))
              : Effect.succeed(bookUpload.id),
          ),
        ),
    } satisfies Partial<BookUploadQueue.Service["Service"]>,
  };
};
const createDatabaseFailure = recordCreateSteps({ createQueued: true });
const createQueueFailure = recordCreateSteps({ offer: true });
const createCleanupFailure = recordCreateSteps({ createQueued: true, cleanup: true });
const temporaryReadFailure = recordCreateSteps({});

type TestClient = Effect.Success<ReturnType<typeof Client.make>>;

// Each case runs the real service over a failing fake, then checks the wire and the typed client.
const uploadProblemCases: ReadonlyArray<{
  readonly name: string;
  readonly layer: ReturnType<typeof serviceLayer>;
  readonly expected: ReturnType<typeof problem>;
  readonly call: (client: TestClient) => Effect.Effect<unknown, unknown>;
  readonly steps?: {
    readonly actual: ReadonlyArray<string>;
    readonly expected: ReadonlyArray<string>;
  };
}> = [
  {
    name: "list uploads: unavailable",
    layer: serviceLayer({ list: Effect.fail(repositoryFailure) }),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.list(),
  },
  {
    name: "get upload: missing",
    layer: serviceLayer({ findById: () => Effect.succeedNone }),
    expected: uploadNotFound,
    call: (client) => client.bookUploads.get(uploadParams),
  },
  {
    name: "get upload: unavailable",
    layer: serviceLayer({ findById: () => Effect.fail(repositoryFailure) }),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.get(uploadParams),
  },
  {
    name: "create upload: storage unavailable",
    layer: serviceLayer({}, { put: () => Effect.fail(storageFailure("put")) }),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.create({ payload: uploadForm() }),
  },
  {
    name: "create upload: temporary file unreadable",
    layer: serviceLayer(
      temporaryReadFailure.repository,
      temporaryReadFailure.storage,
      temporaryReadFailure.queue,
      (path) =>
        Effect.sync(() => {
          temporaryReadFailure.steps.push("readFile");
        }).pipe(
          Effect.andThen(
            Effect.fail(
              PlatformError.systemError({
                module: "FileSystem",
                method: "readFile",
                _tag: "Unknown",
                description: privateDetails,
                pathOrDescriptor: path,
              }),
            ),
          ),
        ),
    ),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.create({ payload: uploadForm() }),
    steps: { actual: temporaryReadFailure.steps, expected: ["readFile"] },
  },
  {
    name: "create upload: database unavailable",
    layer: serviceLayer(
      createDatabaseFailure.repository,
      createDatabaseFailure.storage,
      createDatabaseFailure.queue,
    ),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.create({ payload: uploadForm() }),
    steps: { actual: createDatabaseFailure.steps, expected: ["put", "createQueued", "delete"] },
  },
  {
    name: "create upload: queue unavailable",
    layer: serviceLayer(
      createQueueFailure.repository,
      createQueueFailure.storage,
      createQueueFailure.queue,
    ),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.create({ payload: uploadForm() }),
    steps: {
      actual: createQueueFailure.steps,
      expected: ["put", "createQueued", "offer", "delete"],
    },
  },
  {
    name: "create upload: database and cleanup unavailable",
    layer: serviceLayer(
      createCleanupFailure.repository,
      createCleanupFailure.storage,
      createCleanupFailure.queue,
    ),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.create({ payload: uploadForm() }),
    steps: { actual: createCleanupFailure.steps, expected: ["put", "createQueued", "delete"] },
  },
  {
    name: "delete upload: missing",
    layer: serviceLayer({
      deleteFailed: () =>
        Effect.fail(new BookUploadRepository.UploadNotFound({ uploadId: bookUpload.id })),
    }),
    expected: uploadNotFound,
    call: (client) => client.bookUploads.delete(uploadParams),
  },
  {
    name: "delete upload: not failed",
    layer: serviceLayer({
      deleteFailed: () =>
        Effect.fail(
          new BookUploadRepository.DeletionNotAllowed({
            uploadId: bookUpload.id,
            currentStatus: "queued",
          }),
        ),
    }),
    expected: uploadConflict,
    call: (client) => client.bookUploads.delete(uploadParams),
  },
  {
    name: "delete upload: database unavailable",
    layer: serviceLayer({ deleteFailed: () => Effect.fail(repositoryFailure) }),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.delete(uploadParams),
  },
  {
    name: "delete upload: storage unavailable",
    layer: serviceLayer(
      { deleteFailed: () => Effect.succeed(storedFile) },
      { delete: () => Effect.fail(storageFailure("delete")) },
    ),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.delete(uploadParams),
  },
  {
    name: "delete upload: transaction unavailable",
    layer: serviceLayer(
      {},
      {},
      {},
      undefined,
      Layer.succeed(
        Transaction.Service,
        Transaction.Service.of({
          run: () => Effect.fail(new Transaction.TransactionError({ cause: privateDetails })),
        }),
      ),
    ),
    expected: uploadsUnavailable,
    call: (client) => client.bookUploads.delete(uploadParams),
  },
];

it.effect.each(uploadProblemCases)(
  "returns a private, client-decodable problem for $name",
  ({ call, expected, layer, steps }) =>
    Effect.gen(function* () {
      // Captures the raw response the typed client decodes.
      const responses: Array<HttpClientResponse.HttpClientResponse> = [];
      const client = yield* HttpApiClient.make(api, {
        baseUrl: "",
        transformClient: HttpClient.tap((response) =>
          Effect.sync(() => {
            responses.push(response);
          }),
        ),
      });
      const failure = yield* call(client).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(expected.error);
      const [response] = responses;
      expect(response?.status).toBe(expected.status);
      expect(response?.headers["content-type"]).toContain("application/problem+json");
      expect(
        yield* Effect.fromNullishOr(response).pipe(Effect.flatMap((raw) => raw.json)),
      ).toStrictEqual(expected.body);
      expect(steps?.actual).toEqual(steps?.expected);
    }).pipe(Effect.provide(layer)),
);
