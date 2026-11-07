import { NodeCrypto, NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { api } from "@goho/goho-api/api";
import { Category, CategoryId } from "@goho/goho-api/categories";
import {
  ReceiptUpload,
  ReceiptUploadConflict,
  ReceiptUploadId,
  ReceiptUploadNotFound,
  ReceiptUploadsUnavailable,
} from "@goho/goho-api/receipt-uploads";
import {
  CreateReceiptRequest,
  type PatchReceiptItemRequest,
  type PatchReceiptRequest,
  Receipt,
  ReceiptId,
  ReceiptImageNotFound,
  ReceiptItemId,
  ReceiptItemNotFound,
  ReceiptNotFound,
  ReceiptsUnavailable,
} from "@goho/goho-api/receipts";
import { UploadLimitExceeded } from "@goho/goho-api/response";
import * as Client from "@goho/goho-server-client/client";
import { Array, Effect, FileSystem, Layer, Option, PlatformError } from "effect";
import { HttpBody, HttpClient, type HttpClientResponse, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiError } from "effect/http-api";
import { PersistedQueue } from "effect/persistence";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as Http from "#src/http/routes.ts";
import * as ReceiptUploadQueue from "#src/receipt-uploads/queue.ts";
import * as ReceiptUploadRepository from "#src/receipt-uploads/repository.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";
import * as FileStorage from "#src/services/file-storage.ts";

const createPayload = CreateReceiptRequest.make({
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: "CAD",
  items: [{ name: "Apples", amount: "11", category: "Groceries" }],
});

const groceries = Category.make({
  id: CategoryId.make("1"),
  name: "groceries",
  icon: "groceries",
  color: "green",
  kinds: ["receipt"],
});

const receipt = Receipt.make({
  ...createPayload,
  id: ReceiptId.make("42"),
  categories: [groceries],
  items: Array.map(createPayload.items, (item, position) => ({
    ...item,
    id: ReceiptItemId.make(String(position + 7)),
    position,
    category: groceries,
  })),
});
const itemId = receipt.items[0].id;

const receiptUpload = ReceiptUpload.make({
  id: ReceiptUploadId.make("7d89d8f7-6f0c-4df2-a2a9-94771638ac99"),
  fileName: "receipt.png",
  contentType: "image/png",
  status: "queued",
  receiptId: null,
  failureCode: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
});

const receiptUploadsTest = (overrides: Partial<ReceiptUploads.Interface> = {}) =>
  Layer.succeed(
    ReceiptUploads.Service,
    ReceiptUploads.Service.of({
      delete: () => Effect.void,
      create: () => Effect.succeed(receiptUpload),
      get: () => Effect.succeed(receiptUpload),
      getImage: () =>
        Effect.succeed({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" }),
      list: Effect.succeed([receiptUpload]),
      ...overrides,
    }),
  );

const testLayer = (
  repository: Partial<ReceiptRepository.Interface> = {},
  receiptUploads: Partial<ReceiptUploads.Interface> = {},
  storage: Partial<FileStorage.Interface> = {},
) =>
  HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide([
        Receipts.layer.pipe(
          Layer.provide([
            Transaction.layerTest,
            Layer.succeed(FileStorage.Service, {
              put: () => Effect.die("Unexpected storage.put"),
              get: () => Effect.die("Unexpected storage.get"),
              delete: () => Effect.die("Unexpected storage.delete"),
              ...storage,
            }),
            Layer.succeed(ReceiptRepository.Service, {
              delete: () => Effect.succeedSome({ fileId: null }),
              findById: () => Effect.succeedSome(receipt),
              insert: () => Effect.succeed(receipt.id),
              list: Effect.succeed([receipt]),
              update: () => Effect.die("Unexpected receipt update"),
              updateItem: () => Effect.die("Unexpected item update"),
              ...repository,
            }),
          ]),
        ),
        receiptUploadsTest(receiptUploads),
        Layer.mock(Books.Service, {}),
        Layer.mock(BookUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const TestLive = testLayer();

it.effect("returns private, client-decodable problems for request validation failures", () =>
  Effect.gen(function* () {
    for (const [request, group, endpoint] of [
      [HttpClient.get("/receipts/not-an-id"), "receipts", "get"],
      [HttpClient.get("/books?search=one&search=two"), "books", "list"],
      [
        HttpClient.patch(`/receipts/${receipt.id}`, {
          body: yield* HttpBody.json({
            storeName: "Valid edit",
            privateField: "private-test-value",
          }),
        }),
        "receipts",
        "patch",
      ],
      [
        HttpClient.post("/receipts", {
          body: yield* HttpBody.json({ ...createPayload, currency: "private-test-value" }),
        }),
        "receipts",
        "create",
      ],
      [
        HttpClient.post("/receipts", {
          body: HttpBody.text("{private-test-value", "application/json"),
        }),
        "receipts",
        "create",
      ],
      [
        HttpClient.post("/receipts", { body: HttpBody.text("", "application/json") }),
        "receipts",
        "create",
      ],
    ] as const) {
      const response = yield* request;
      expect(response.status).toBe(400);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(yield* response.json).toEqual({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
      });
      const decoded = yield* HttpApiClient.decodeResponse(api, { group, endpoint })(response).pipe(
        Effect.flip,
      );
      expect(decoded).toBeInstanceOf(HttpApiError.BadRequestProblem);
    }
  }).pipe(Effect.provide(TestLive)),
);

it.effect("returns a safe problem when a successful response cannot be encoded", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const decoded = yield* client.receipts
      .get({ params: { receiptId: receipt.id } })
      .pipe(Effect.flip);
    expect(decoded).toBeInstanceOf(HttpApiError.InternalServerErrorProblem);
    const response = yield* HttpClient.get(`/receipts/${receipt.id}`);
    expect(response.status).toBe(500);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(yield* response.json).toEqual({
      type: "about:blank",
      status: 500,
      title: "Internal Server Error",
    });
  }).pipe(
    Effect.provide(
      testLayer({ findById: () => Effect.succeedSome({ ...receipt, storeName: " " }) }),
    ),
  ),
);

it.effect("creates a receipt through the generated client and returns the complete receipt", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const result = yield* client.receipts.create({ payload: createPayload });
    expect(result).toEqual({ data: receipt });
  }).pipe(Effect.provide(TestLive)),
);

it.effect("normalizes decimal strings before inserting a receipt", () => {
  const inserted: CreateReceiptRequest[] = [];
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    yield* client.receipts.create({
      payload: CreateReceiptRequest.make({
        ...createPayload,
        subtotal: "10.250",
        tax: "7.5e-1",
        total: "11.00",
        items: [{ name: "Apples", amount: "12.00", category: "Groceries" }],
      }),
    });
    expect(
      inserted.map(({ subtotal, tax, total, items }) => ({ subtotal, tax, total, items })),
    ).toEqual([
      {
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        items: [{ name: "Apples", amount: "12", category: "Groceries" }],
      },
    ]);
  }).pipe(
    Effect.provide(
      testLayer({
        insert: (input) => {
          inserted.push(input);
          return Effect.succeed(receipt.id);
        },
      }),
    ),
  );
});

it.effect("lists complete receipts through the generated client", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    expect(yield* client.receipts.list()).toEqual({ data: [receipt] });
  }).pipe(Effect.provide(TestLive)),
);

it.effect("gets one complete receipt through the generated client", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    expect(yield* client.receipts.get({ params: { receiptId: receipt.id } })).toEqual({
      data: receipt,
    });
    const response = yield* HttpClient.get(`/receipts/${receipt.id}`);
    expect(yield* response.json).toMatchObject({
      data: { id: "42", items: [{ id: "7", position: 0 }] },
    });
  }).pipe(Effect.provide(TestLive)),
);

it.effect("uploads one receipt image and retrieves its status through the generated client", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "receipt.png", { type: "image/png" }),
    );

    expect(yield* client.receiptUploads.create({ payload: form })).toEqual({
      data: receiptUpload,
    });
    expect(yield* client.receiptUploads.get({ params: { uploadId: receiptUpload.id } })).toEqual({
      data: receiptUpload,
    });
  }).pipe(Effect.provide(TestLive)),
);
it.effect("lists receipt uploads through the generated client", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    expect(yield* client.receiptUploads.list()).toEqual({ data: [receiptUpload] });
  }).pipe(Effect.provide(TestLive)),
);

it.effect("returns the scanned image with its MIME type and private cache policy", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipts/${receipt.id}/image`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(new Uint8Array(yield* response.arrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  }).pipe(Effect.provide(TestLive)),
);

it.effect("returns HTTP 404 when a receipt has no uploaded image", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipts/${receipt.id}/image`);
    expect(response.status).toBe(404);
  }).pipe(
    Effect.provide(testLayer({}, { getImage: () => Effect.fail(new ReceiptImageNotFound()) })),
  ),
);

it.effect("returns HTTP 404 when a receipt upload does not exist", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipt-uploads/${receiptUpload.id}`);
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer({}, { get: () => Effect.fail(new ReceiptUploadNotFound()) }))),
);

it.effect("rejects unsupported receipt upload content types", () =>
  Effect.gen(function* () {
    const form = new FormData();
    form.append("file", new File(["not an image"], "receipt.txt", { type: "text/plain" }));
    const response = yield* HttpClient.post("/receipt-uploads", { body: HttpBody.formData(form) });
    expect(response.status).toBe(400);
  }).pipe(Effect.provide(TestLive)),
);

it.live(
  "returns the shared problem for receipt uploads over a size or part limit before the service",
  () => {
    let calls = 0;
    const layer = testLayer(
      {},
      {
        create: () =>
          Effect.sync(() => {
            calls += 1;
            return receiptUpload;
          }),
      },
    );
    return Effect.gen(function* () {
      const image = (size: number, name = "receipt.png") =>
        new File([new Uint8Array(size)], name, { type: "image/png" });
      const oversizedFile = new FormData();
      oversizedFile.append("file", image(20 * 1024 * 1024 + 1));
      const tooManyParts = new FormData();
      tooManyParts.append("file", image(1));
      tooManyParts.append("file", image(1, "second.png"));
      const oversizedField = new FormData();
      oversizedField.append("file", "x".repeat(10 * 1024 * 1024 + 1));
      const client = yield* Client.make("");
      for (const [limit, form] of [
        ["file size", oversizedFile],
        ["part count", tooManyParts],
        ["field size", oversizedField],
      ] as const) {
        const response = yield* HttpClient.post("/receipt-uploads", {
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
        const failure = yield* client.receiptUploads.create({ payload: form }).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(UploadLimitExceeded);
      }
      expect(calls).toBe(0);
    }).pipe(Effect.provide(layer));
  },
  15_000,
);

it.effect("returns HTTP 404 when a receipt does not exist", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipts/${receipt.id}`);
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer({ findById: () => Effect.succeedNone }))),
);

it.effect("rejects malformed and out-of-range receipt IDs on every receipt route", () =>
  Effect.gen(function* () {
    const receiptChange = yield* HttpBody.json({ storeName: "Corner Store" });
    const itemChange = yield* HttpBody.json({ name: "Pears" });
    for (const id of [
      "not-an-integer",
      "0",
      "-1",
      "01",
      "9223372036854775808",
      "10000000000000000000",
    ]) {
      for (const [route, request] of [
        ["get", HttpClient.get(`/receipts/${id}`)],
        ["getImage", HttpClient.get(`/receipts/${id}/image`)],
        ["delete", HttpClient.del(`/receipts/${id}`)],
        ["patch", HttpClient.patch(`/receipts/${id}`, { body: receiptChange })],
        ["patchItem", HttpClient.patch(`/receipts/${id}/items/${itemId}`, { body: itemChange })],
      ] as const) {
        expect((yield* request).status, `${route} ${id}`).toBe(400);
      }
    }
  }).pipe(
    Effect.provide(
      testLayer(
        {
          findById: () => Effect.die("Must not get"),
          delete: () => Effect.die("Must not delete"),
        },
        { getImage: () => Effect.die("Must not get image") },
      ),
    ),
  ),
);

it.effect("returns HTTP 500 without exposing receipt listing failure details", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get("/receipts");
    expect(response.status).toBe(500);
    expect(yield* response.text).not.toContain("private database details");
  }).pipe(
    Effect.provide(
      testLayer({
        list: Effect.fail(
          new ReceiptRepository.PersistenceError({
            operation: "list",
            cause: "private database details",
          }),
        ),
      }),
    ),
  ),
);

it.effect("returns HTTP 500 without exposing private repository failure details", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json(createPayload);
    const response = yield* HttpClient.post("/receipts", { body });
    expect(response.status).toBe(500);
    expect(yield* response.text).not.toContain("private database details");
  }).pipe(
    Effect.provide(
      testLayer({
        insert: () =>
          Effect.fail(
            new ReceiptRepository.PersistenceError({
              operation: "insert",
              cause: "private database details",
            }),
          ),
      }),
    ),
  ),
);

it.effect("rejects missing, null, and malformed currency at the HTTP boundary", () =>
  Effect.gen(function* () {
    for (const currency of [undefined, null, "", "cad", "CA", "CAD "]) {
      const body = yield* HttpBody.json({ ...createPayload, currency });
      const response = yield* HttpClient.post("/receipts", { body });
      expect(response.status).toBe(400);
    }
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rejects invalid receipt data at the HTTP boundary", () =>
  Effect.gen(function* () {
    for (const payload of [
      { ...createPayload, receiptDate: "2024-02-30" },
      { ...createPayload, items: [] },
      // Every item needs its own nonblank category.
      { ...createPayload, items: [{ name: "Apples", amount: "11" }] },
      { ...createPayload, items: [{ name: "Apples", amount: "11", category: " " }] },
    ]) {
      const body = yield* HttpBody.json(payload);
      const response = yield* HttpClient.post("/receipts", { body });
      expect(response.status).toBe(400);
    }
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rejects unknown receipt and item creation fields before saving anything", () => {
  const inserted: CreateReceiptRequest[] = [];
  return Effect.gen(function* () {
    for (const payload of [
      { ...createPayload, category: "Groceries" },
      { ...createPayload, id: "43" },
      { ...createPayload, items: [{ ...createPayload.items[0], position: 1 }] },
      {
        ...createPayload,
        items: [createPayload.items[0], { ...createPayload.items[0], id: "8" }],
      },
    ]) {
      const response = yield* HttpClient.post("/receipts", {
        body: yield* HttpBody.json(payload),
      });
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(yield* response.json).toEqual({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
      });
    }
    expect(inserted).toEqual([]);
  }).pipe(
    Effect.provide(
      testLayer({
        insert: (input) =>
          Effect.sync(() => {
            inserted.push(input);
            return receipt.id;
          }),
      }),
    ),
  );
});

it.effect("does not expose the removed receipt processing endpoint", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.post("/receipts/process", {
      body: yield* HttpBody.json({ rootFolderId: "root", spreadsheetId: "sheet", concurrency: 1 }),
    });
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(TestLive)),
);

it.effect(
  "returns liveness through HTTP and the generated client without receipt dependencies",
  () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health");
      expect(response.status).toBe(200);
      expect(yield* response.json).toEqual({ data: { status: "ok" } });
      const client = yield* Client.make("");
      expect(yield* client.health.check()).toEqual({ data: { status: "ok" } });
    }).pipe(
      Effect.provide(
        HttpRouter.serve(
          Http.layer.pipe(
            Layer.provide([
              Layer.succeed(Receipts.Service, {
                delete: () => Effect.die("Health must not delete receipts"),
                create: () => Effect.die("Health must not create receipts"),
                get: () => Effect.die("Health must not get receipts"),
                list: Effect.die("Health must not list receipts"),
                patch: () => Effect.die("Health must not correct receipts"),
                patchItem: () => Effect.die("Health must not rename items"),
              }),
              receiptUploadsTest(),
              Layer.mock(Books.Service, {}),
              Layer.mock(BookUploads.Service, {}),
            ]),
          ),
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest)),
      ),
    ),
);

it.effect(
  "deletes a receipt through the generated client and returns HTTP 204 without a body",
  () =>
    Effect.gen(function* () {
      const client = yield* Client.make("");
      expect(yield* client.receipts.delete({ params: { receiptId: receipt.id } })).toBeUndefined();
      const response = yield* HttpClient.del(`/receipts/${receipt.id}`);
      expect(response.status).toBe(204);
      expect(yield* response.text).toBe("");
    }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes the original photo linked to the receipt", () => {
  const deleted: FileStorage.FileId[] = [];
  const fileId = FileStorage.FileId.make("stored-photo");
  return Effect.gen(function* () {
    const response = yield* HttpClient.del(`/receipts/${receipt.id}`);
    expect(response.status).toBe(204);
    expect(deleted).toEqual([fileId]);
  }).pipe(
    Effect.provide(
      testLayer(
        { delete: () => Effect.succeedSome({ fileId }) },
        {},
        {
          delete: (id) =>
            Effect.sync(() => {
              deleted.push(id);
            }),
        },
      ),
    ),
  );
});

it.effect("returns HTTP 404 when deleting a missing receipt", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.del(`/receipts/${receipt.id}`);
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer({ delete: () => Effect.succeedNone }))),
);

it.effect("returns HTTP 500 without exposing database deletion failure details", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.del(`/receipts/${receipt.id}`);
    expect(response.status).toBe(500);
    expect(yield* response.text).not.toContain("private database details");
  }).pipe(
    Effect.provide(
      testLayer({
        delete: () =>
          Effect.fail(
            new ReceiptRepository.PersistenceError({
              operation: "delete",
              cause: "private database details",
            }),
          ),
      }),
    ),
  ),
);

it.effect("returns HTTP 500 when photo deletion fails without exposing storage details", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.del(`/receipts/${receipt.id}`);
    expect(response.status).toBe(500);
    expect(yield* response.text).not.toContain("private storage details");
  }).pipe(
    Effect.provide(
      testLayer(
        { delete: () => Effect.succeedSome({ fileId: FileStorage.FileId.make("stored-photo") }) },
        {},
        {
          delete: () =>
            Effect.fail(
              new FileStorage.StorageError({
                operation: "delete",
                cause: "private storage details",
              }),
            ),
        },
      ),
    ),
  ),
);

it.effect(
  "deletes a failed upload through the generated client and returns an empty HTTP 204",
  () => {
    const deleted: ReceiptUploadId[] = [];
    return Effect.gen(function* () {
      const client = yield* Client.make("");
      expect(
        yield* client.receiptUploads.delete({ params: { uploadId: receiptUpload.id } }),
      ).toBeUndefined();
      const response = yield* HttpClient.del(`/receipt-uploads/${receiptUpload.id}`);
      expect(response.status).toBe(204);
      expect(yield* response.text).toBe("");
      expect(deleted).toEqual([receiptUpload.id, receiptUpload.id]);
    }).pipe(
      Effect.provide(
        testLayer(
          {},
          {
            delete: (uploadId) =>
              Effect.sync(() => {
                deleted.push(uploadId);
              }),
          },
        ),
      ),
    );
  },
);

it.effect("rejects malformed upload IDs before lookup or deletion", () =>
  Effect.gen(function* () {
    expect((yield* HttpClient.get("/receipt-uploads/not-a-uuid")).status).toBe(400);
    expect((yield* HttpClient.del("/receipt-uploads/not-a-uuid")).status).toBe(400);
  }).pipe(
    Effect.provide(
      testLayer(
        {},
        { get: () => Effect.die("Must not get"), delete: () => Effect.die("Must not delete") },
      ),
    ),
  ),
);

const snacks = Category.make({
  id: CategoryId.make("9"),
  name: "snacks",
  icon: "other",
  color: "grey",
  kinds: ["receipt", "book"],
});

const recordUpdates = () => {
  const updates: Array<{ receiptId: ReceiptId; changes: PatchReceiptRequest }> = [];
  const itemUpdates: Array<{
    receiptId: ReceiptId;
    itemId: ReceiptItemId;
    changes: PatchReceiptItemRequest;
  }> = [];
  const repository: Partial<ReceiptRepository.Interface> = {
    update: (receiptId, changes) =>
      Effect.sync(() => {
        updates.push({ receiptId, changes });
        return Option.some({ ...receipt, ...changes });
      }),
    updateItem: (receiptId, itemId, changes) =>
      Effect.sync(() => {
        itemUpdates.push({ receiptId, itemId, changes });
        return Option.some({
          ...receipt.items[0],
          id: itemId,
          name: changes.name ?? receipt.items[0].name,
          category: changes.category === undefined ? groceries : snacks,
        });
      }),
  };
  return { updates, itemUpdates, repository };
};

it.effect("corrects receipt fields through the generated client and returns the receipt", () => {
  const recorded = recordUpdates();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    for (const payload of [
      { receiptDate: "2024-09-02" },
      { storeName: "Corner Store" },
      { storeName: "Corner Store", receiptDate: "2024-09-02" },
    ]) {
      expect(yield* client.receipts.patch({ params: { receiptId: receipt.id }, payload })).toEqual({
        data: { ...receipt, ...payload },
      });
    }
    expect(recorded.updates).toEqual([
      { receiptId: receipt.id, changes: { receiptDate: "2024-09-02" } },
      { receiptId: receipt.id, changes: { storeName: "Corner Store" } },
      { receiptId: receipt.id, changes: { storeName: "Corner Store", receiptDate: "2024-09-02" } },
    ]);
  }).pipe(Effect.provide(testLayer(recorded.repository)));
});

it.effect("trims corrected names and passes only supplied fields to the repository", () => {
  const recorded = recordUpdates();
  return Effect.gen(function* () {
    const response = yield* HttpClient.patch(`/receipts/${receipt.id}`, {
      body: yield* HttpBody.json({ storeName: "  Corner Store ", receiptDate: "2024-09-02" }),
    });
    expect(response.status).toBe(200);
    expect(yield* response.json).toEqual({
      data: { ...receipt, storeName: "Corner Store", receiptDate: "2024-09-02" },
    });
    expect(recorded.updates).toEqual([
      { receiptId: receipt.id, changes: { storeName: "Corner Store", receiptDate: "2024-09-02" } },
    ]);
  }).pipe(Effect.provide(testLayer(recorded.repository)));
});

it.effect("corrects an item by ID through the generated client and returns only the item", () => {
  const recorded = recordUpdates();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    for (const [payload, saved] of [
      [{ name: "Pears" }, { name: "Pears" }],
      [{ category: "Snacks" }, { category: snacks }],
      [
        { name: "Pears", category: "Snacks" },
        { name: "Pears", category: snacks },
      ],
    ] as const) {
      expect(
        yield* client.receipts.patchItem({ params: { receiptId: receipt.id, itemId }, payload }),
      ).toEqual({ data: { ...receipt.items[0], ...saved } });
    }
    // The largest PostgreSQL bigint stays exact text end to end for both IDs.
    const maxId = "9223372036854775807";
    const response = yield* HttpClient.patch(`/receipts/${maxId}/items/${maxId}`, {
      body: yield* HttpBody.json({ name: "  Granny Smith apples  ", category: " Snacks " }),
    });
    expect(response.status).toBe(200);
    expect(yield* response.json).toStrictEqual({
      data: {
        id: maxId,
        position: 0,
        name: "Granny Smith apples",
        amount: "11",
        category: snacks,
      },
    });
    expect(recorded.itemUpdates).toEqual([
      { receiptId: receipt.id, itemId, changes: { name: "Pears" } },
      { receiptId: receipt.id, itemId, changes: { category: "Snacks" } },
      { receiptId: receipt.id, itemId, changes: { name: "Pears", category: "Snacks" } },
      {
        receiptId: maxId,
        itemId: maxId,
        changes: { name: "Granny Smith apples", category: "Snacks" },
      },
    ]);
  }).pipe(Effect.provide(testLayer(recorded.repository)));
});

it.effect("rejects empty, unsupported, mixed, null, and invalid receipt corrections", () => {
  const recorded = recordUpdates();
  return Effect.gen(function* () {
    for (const payload of [
      {},
      { amount: "1" },
      { subtotal: "1" },
      { tax: "1" },
      { total: "1" },
      { currency: "USD" },
      { items: [{ name: "Apples", amount: "11" }] },
      { id: "43" },
      { createdAt: "2026-09-20T00:00:00.000Z" },
      { updatedAt: "2026-09-20T00:00:00.000Z" },
      { storeName: "Corner Store", total: "12" },
      { receiptDate: "2024-09-02", currency: "USD" },
      // Categories belong to items now.
      { category: "Snacks" },
      { storeName: "Corner Store", category: "Snacks" },
      { storeName: null },
      { receiptDate: null },
      { storeName: "" },
      { storeName: "   " },
      { storeName: 42 },
      { receiptDate: "2024-02-30" },
      { receiptDate: "2024/09/02" },
      { receiptDate: "2024-9-2" },
      null,
      [],
      [{ storeName: "Corner Store" }],
      "Corner Store",
      42,
    ]) {
      const response = yield* HttpClient.patch(`/receipts/${receipt.id}`, {
        body: yield* HttpBody.json(payload),
      });
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(yield* response.json).toEqual({
        type: "about:blank",
        status: 400,
        title: "Bad Request",
        detail: "Request validation failed",
      });
    }
    const unparsable = yield* HttpClient.patch(`/receipts/${receipt.id}`, {
      body: HttpBody.text("{", "application/json"),
    });
    expect(unparsable.status).toBe(400);
    expect(recorded.updates).toEqual([]);
  }).pipe(Effect.provide(testLayer(recorded.repository)));
});

it.effect(
  "rejects invalid item renames and malformed or overflowing item IDs without saving",
  () => {
    const recorded = recordUpdates();
    return Effect.gen(function* () {
      for (const payload of [
        {},
        { name: null },
        { name: "" },
        { name: "   " },
        { name: 42 },
        { category: null },
        { category: " " },
        { name: "Pears", category: "" },
        { amount: "1" },
        { name: "Pears", amount: "1" },
        { name: "Pears", position: 1 },
        { name: "Pears", id: "8" },
        { name: "Pears", currency: "USD" },
        null,
        [],
        "Pears",
      ]) {
        const response = yield* HttpClient.patch(`/receipts/${receipt.id}/items/${itemId}`, {
          body: yield* HttpBody.json(payload),
        });
        expect(response.status, JSON.stringify(payload)).toBe(400);
      }
      for (const id of [
        "0",
        "-1",
        "01",
        "00",
        "1.0",
        "1e1",
        "+1",
        "%201",
        "0x1",
        "abc",
        "9223372036854775808",
        "9999999999999999999",
        "10000000000000000000",
      ]) {
        const response = yield* HttpClient.patch(`/receipts/${receipt.id}/items/${id}`, {
          body: yield* HttpBody.json({ name: "Pears" }),
        });
        expect(response.status, id).toBe(400);
        expect(yield* response.json).toEqual({
          type: "about:blank",
          status: 400,
          title: "Bad Request",
          detail: "Request validation failed",
        });
      }
      expect(recorded.itemUpdates).toEqual([]);
    }).pipe(Effect.provide(testLayer(recorded.repository)));
  },
);

const privateDetails = "private SQL and /private/path details";
const repositoryFailure = new ReceiptRepository.PersistenceError({
  operation: "test",
  cause: privateDetails,
});
const uploadRepositoryFailure = new ReceiptUploadRepository.PersistenceError({
  operation: "test",
  cause: privateDetails,
});
const storageFailure = (operation: "put" | "get" | "delete") =>
  new FileStorage.StorageError({ operation, cause: privateDetails });
const storedFile = FileStorage.FileId.make("stored-photo");
const missingUpload = new ReceiptUploadRepository.UploadNotFound({ uploadId: receiptUpload.id });

// The real upload service over fake persistence, so failures take the production mapping.
const uploadServiceLayer = (
  repository: Partial<ReceiptUploadRepository.Interface>,
  storage: Partial<FileStorage.Interface> = {},
  queue: Partial<ReceiptUploadQueue.Service["Service"]> = {},
  // Multipart parsing keeps the real file system; only the handler's temp read is replaced.
  readFile?: FileSystem.FileSystem["readFile"],
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
        ReceiptUploads.layer.pipe(
          Layer.provide([
            Transaction.layerTest,
            NodeCrypto.layer,
            Layer.mock(ReceiptUploadQueue.Service, queue),
            Layer.mock(FileStorage.Service, storage),
            Layer.mock(ReceiptUploadRepository.Service, repository),
          ]),
        ),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(Books.Service, {}),
        Layer.mock(BookUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const problem = (type: string, status: number, title: string) => ({
  body: { type: `goho:problem:${type}`, status, title },
  status,
});
const receiptNotFound = {
  ...problem("receipt-not-found", 404, "Receipt not found"),
  error: ReceiptNotFound,
};
const receiptsUnavailable = {
  ...problem("receipts-unavailable", 500, "Receipts unavailable"),
  error: ReceiptsUnavailable,
};
const uploadNotFound = {
  ...problem("receipt-upload-not-found", 404, "Receipt upload not found"),
  error: ReceiptUploadNotFound,
};
const uploadsUnavailable = {
  ...problem("receipt-uploads-unavailable", 500, "Receipt uploads unavailable"),
  error: ReceiptUploadsUnavailable,
};
const uploadConflict = {
  ...problem("receipt-upload-conflict", 409, "Receipt upload cannot be deleted"),
  error: ReceiptUploadConflict,
};
const itemNotFound = {
  ...problem("receipt-item-not-found", 404, "Receipt item not found"),
  error: ReceiptItemNotFound,
};
const imageNotFound = {
  ...problem("receipt-image-not-found", 404, "Receipt image not found"),
  error: ReceiptImageNotFound,
};

const receiptParams = { params: { receiptId: receipt.id } };
const uploadParams = { params: { uploadId: receiptUpload.id } };
const uploadForm = () => {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1])], "receipt.png", { type: "image/png" }));
  return form;
};

// Upload handoff steps a create reached, in order, for the no-write assertions below.
const recordCreateSteps = (failing: {
  readonly createQueued?: boolean;
  readonly offer?: boolean;
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
              ? Effect.fail(uploadRepositoryFailure)
              : Effect.succeed({ ...receiptUpload, fileId: storedFile }),
          ),
        ),
    } satisfies Partial<ReceiptUploadRepository.Interface>,
    storage: {
      put: () => step("put").pipe(Effect.as(storedFile)),
      delete: () => step("delete"),
    } satisfies Partial<FileStorage.Interface>,
    queue: {
      offer: () =>
        step("offer").pipe(
          Effect.andThen(
            failing.offer
              ? Effect.fail(new PersistedQueue.PersistedQueueError({ message: privateDetails }))
              : Effect.succeed(receiptUpload.id),
          ),
        ),
    } satisfies Partial<ReceiptUploadQueue.Service["Service"]>,
  };
};
const createDatabaseFailure = recordCreateSteps({ createQueued: true });
const createQueueFailure = recordCreateSteps({ offer: true });
const temporaryReadFailure = recordCreateSteps({});

type TestClient = Effect.Success<ReturnType<typeof Client.make>>;

// Each case runs the real service over a failing fake, then checks the wire and the typed client.
const receiptProblemCases: ReadonlyArray<{
  readonly name: string;
  readonly layer: ReturnType<typeof testLayer>;
  readonly expected:
    | typeof receiptNotFound
    | typeof receiptsUnavailable
    | typeof itemNotFound
    | typeof imageNotFound
    | typeof uploadNotFound
    | typeof uploadConflict
    | typeof uploadsUnavailable;
  readonly call: (client: TestClient) => Effect.Effect<unknown, unknown>;
  readonly steps?: {
    readonly actual: ReadonlyArray<string>;
    readonly expected: ReadonlyArray<string>;
  };
}> = [
  {
    name: "list receipts: unavailable",
    layer: testLayer({ list: Effect.fail(repositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.list(),
  },
  {
    name: "get receipt: missing",
    layer: testLayer({ findById: () => Effect.succeedNone }),
    expected: receiptNotFound,
    call: (client) => client.receipts.get(receiptParams),
  },
  {
    name: "get receipt: unavailable",
    layer: testLayer({ findById: () => Effect.fail(repositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.get(receiptParams),
  },
  {
    name: "create receipt: unavailable",
    layer: testLayer({ insert: () => Effect.fail(repositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.create({ payload: createPayload }),
  },
  {
    name: "patch receipt: missing",
    layer: testLayer({ update: () => Effect.succeedNone }),
    expected: receiptNotFound,
    call: (client) =>
      client.receipts.patch({ ...receiptParams, payload: { storeName: "Corner Store" } }),
  },
  {
    name: "patch receipt: unavailable",
    layer: testLayer({ update: () => Effect.fail(repositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) =>
      client.receipts.patch({ ...receiptParams, payload: { storeName: "Corner Store" } }),
  },
  {
    name: "patch item: missing",
    layer: testLayer({ updateItem: () => Effect.succeedNone }),
    expected: itemNotFound,
    call: (client) =>
      client.receipts.patchItem({
        params: { receiptId: receipt.id, itemId },
        payload: { name: "Pears" },
      }),
  },
  {
    name: "patch item: unavailable",
    layer: testLayer({ updateItem: () => Effect.fail(repositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) =>
      client.receipts.patchItem({
        params: { receiptId: receipt.id, itemId },
        payload: { name: "Pears" },
      }),
  },
  {
    name: "delete receipt: missing",
    layer: testLayer({ delete: () => Effect.succeedNone }),
    expected: receiptNotFound,
    call: (client) => client.receipts.delete(receiptParams),
  },
  {
    name: "delete receipt: database unavailable",
    layer: testLayer({ delete: () => Effect.fail(repositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.delete(receiptParams),
  },
  {
    name: "delete receipt: storage unavailable",
    layer: testLayer(
      { delete: () => Effect.succeedSome({ fileId: storedFile }) },
      {},
      { delete: () => Effect.fail(storageFailure("delete")) },
    ),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.delete(receiptParams),
  },
  {
    name: "get receipt image: missing",
    layer: uploadServiceLayer({ findByReceiptId: () => Effect.succeedNone }),
    expected: imageNotFound,
    call: (client) => client.receipts.getImage(receiptParams),
  },
  {
    name: "get receipt image: database unavailable",
    layer: uploadServiceLayer({ findByReceiptId: () => Effect.fail(uploadRepositoryFailure) }),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.getImage(receiptParams),
  },
  {
    name: "get receipt image: storage unavailable",
    layer: uploadServiceLayer(
      {
        findByReceiptId: () => Effect.succeedSome({ ...receiptUpload, fileId: storedFile }),
      },
      { get: () => Effect.fail(storageFailure("get")) },
    ),
    expected: receiptsUnavailable,
    call: (client) => client.receipts.getImage(receiptParams),
  },
  {
    name: "list uploads: unavailable",
    layer: uploadServiceLayer({ list: Effect.fail(uploadRepositoryFailure) }),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.list(),
  },
  {
    name: "get upload: missing",
    layer: uploadServiceLayer({ findById: () => Effect.succeedNone }),
    expected: uploadNotFound,
    call: (client) => client.receiptUploads.get(uploadParams),
  },
  {
    name: "get upload: unavailable",
    layer: uploadServiceLayer({ findById: () => Effect.fail(uploadRepositoryFailure) }),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.get(uploadParams),
  },
  {
    name: "create upload: storage unavailable",
    layer: uploadServiceLayer({}, { put: () => Effect.fail(storageFailure("put")) }),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.create({ payload: uploadForm() }),
  },
  {
    name: "create upload: temporary file unreadable",
    layer: uploadServiceLayer(
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
    call: (client) => client.receiptUploads.create({ payload: uploadForm() }),
    steps: { actual: temporaryReadFailure.steps, expected: ["readFile"] },
  },
  {
    name: "create upload: database unavailable",
    layer: uploadServiceLayer(
      createDatabaseFailure.repository,
      createDatabaseFailure.storage,
      createDatabaseFailure.queue,
    ),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.create({ payload: uploadForm() }),
    steps: { actual: createDatabaseFailure.steps, expected: ["put", "createQueued", "delete"] },
  },
  {
    name: "create upload: queue unavailable",
    layer: uploadServiceLayer(
      createQueueFailure.repository,
      createQueueFailure.storage,
      createQueueFailure.queue,
    ),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.create({ payload: uploadForm() }),
    steps: {
      actual: createQueueFailure.steps,
      expected: ["put", "createQueued", "offer", "delete"],
    },
  },
  {
    name: "delete upload: missing",
    layer: uploadServiceLayer({ deleteFailed: () => Effect.fail(missingUpload) }),
    expected: uploadNotFound,
    call: (client) => client.receiptUploads.delete(uploadParams),
  },
  {
    name: "delete upload: not failed",
    layer: uploadServiceLayer({
      deleteFailed: () =>
        Effect.fail(
          new ReceiptUploadRepository.DeletionNotAllowed({
            uploadId: receiptUpload.id,
            currentStatus: "queued",
          }),
        ),
    }),
    expected: uploadConflict,
    call: (client) => client.receiptUploads.delete(uploadParams),
  },
  {
    name: "delete upload: database unavailable",
    layer: uploadServiceLayer({ deleteFailed: () => Effect.fail(uploadRepositoryFailure) }),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.delete(uploadParams),
  },
  {
    name: "delete upload: storage unavailable",
    layer: uploadServiceLayer(
      { deleteFailed: () => Effect.succeed(storedFile) },
      { delete: () => Effect.fail(storageFailure("delete")) },
    ),
    expected: uploadsUnavailable,
    call: (client) => client.receiptUploads.delete(uploadParams),
  },
];

it.effect.each(receiptProblemCases)(
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
