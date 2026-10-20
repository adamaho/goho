import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { ReceiptUpload, ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import {
  Category,
  CategoryId,
  CreateReceiptRequest,
  type PatchReceiptItemRequest,
  type PatchReceiptRequest,
  Receipt,
  ReceiptId,
  ReceiptItemId,
} from "@goho/goho-api/receipts";
import * as Client from "@goho/goho-server-client/client";
import { Array, Effect, Layer, Option } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { expect } from "vitest";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";

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
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const TestLive = testLayer();

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
    Effect.provide(testLayer({}, { getImage: () => Effect.fail(new HttpApiError.NotFound()) })),
  ),
);

it.effect("rejects malformed receipt IDs for image retrieval", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get("/receipts/not-an-integer/image");
    expect(response.status).toBe(400);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("returns HTTP 404 when a receipt upload does not exist", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipt-uploads/${receiptUpload.id}`);
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer({}, { get: () => Effect.fail(new HttpApiError.NotFound()) }))),
);

it.effect("rejects unsupported receipt upload content types", () =>
  Effect.gen(function* () {
    const form = new FormData();
    form.append("file", new File(["not an image"], "receipt.txt", { type: "text/plain" }));
    const response = yield* HttpClient.post("/receipt-uploads", { body: HttpBody.formData(form) });
    expect(response.status).toBe(400);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("returns HTTP 404 when a receipt does not exist", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipts/${receipt.id}`);
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer({ findById: () => Effect.succeedNone }))),
);

it.effect("rejects malformed and overlong receipt IDs at the HTTP boundary", () =>
  Effect.gen(function* () {
    for (const id of ["not-an-integer", "0", "10000000000000000000"]) {
      const response = yield* HttpClient.get(`/receipts/${id}`);
      expect(response.status).toBe(400);
    }
  }).pipe(Effect.provide(TestLive)),
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

it.effect("rejects malformed receipt IDs before deleting anything", () =>
  Effect.gen(function* () {
    for (const id of ["not-an-integer", "0", "10000000000000000000"]) {
      expect((yield* HttpClient.del(`/receipts/${id}`)).status).toBe(400);
    }
  }).pipe(Effect.provide(testLayer({ delete: () => Effect.die("Must not delete") }))),
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

it.effect("rejects malformed upload IDs before deletion", () =>
  Effect.gen(function* () {
    expect((yield* HttpClient.del("/receipt-uploads/not-a-uuid")).status).toBe(400);
  }).pipe(Effect.provide(testLayer({}, { delete: () => Effect.die("Must not delete") }))),
);

it.effect("returns the documented status for missing, non-failed, and unavailable uploads", () =>
  Effect.gen(function* () {
    for (const [error, status] of [
      [new HttpApiError.NotFound(), 404],
      [new HttpApiError.Conflict(), 409],
      [new HttpApiError.InternalServerError(), 500],
    ] as const) {
      yield* Effect.gen(function* () {
        const response = yield* HttpClient.del(`/receipt-uploads/${receiptUpload.id}`);
        expect(response.status).toBe(status);
        expect(yield* response.json).toEqual({ _tag: error._tag });
      }).pipe(Effect.provide(testLayer({}, { delete: () => Effect.fail(error) })));
    }
  }),
);

const snacks = Category.make({
  id: CategoryId.make("9"),
  name: "snacks",
  icon: "other",
  color: "grey",
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
    // The largest PostgreSQL bigint stays exact text end to end.
    const response = yield* HttpClient.patch(`/receipts/${receipt.id}/items/9223372036854775807`, {
      body: yield* HttpBody.json({ name: "  Granny Smith apples  ", category: " Snacks " }),
    });
    expect(response.status).toBe(200);
    expect(yield* response.json).toStrictEqual({
      data: {
        id: "9223372036854775807",
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
        receiptId: receipt.id,
        itemId: "9223372036854775807",
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
      expect(yield* response.text).toBe("");
    }
    const unparsable = yield* HttpClient.patch(`/receipts/${receipt.id}`, {
      body: HttpBody.text("{", "application/json"),
    });
    expect(unparsable.status).toBe(400);
    for (const id of ["not-an-integer", "0", "10000000000000000000"]) {
      const response = yield* HttpClient.patch(`/receipts/${id}`, {
        body: yield* HttpBody.json({ storeName: "Corner Store" }),
      });
      expect(response.status).toBe(400);
    }
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
        expect(yield* response.text).toBe("");
      }
      for (const id of ["not-an-integer", "0", "10000000000000000000"]) {
        const response = yield* HttpClient.patch(`/receipts/${id}/items/${itemId}`, {
          body: yield* HttpBody.json({ name: "Pears" }),
        });
        expect(response.status).toBe(400);
      }
      expect(recorded.itemUpdates).toEqual([]);
    }).pipe(Effect.provide(testLayer(recorded.repository)));
  },
);

it.effect("returns HTTP 404 when correcting a missing receipt or item", () =>
  Effect.gen(function* () {
    const receiptResponse = yield* HttpClient.patch(`/receipts/${receipt.id}`, {
      body: yield* HttpBody.json({ storeName: "Corner Store" }),
    });
    expect(receiptResponse.status).toBe(404);
    expect(yield* receiptResponse.json).toEqual({ _tag: "NotFound" });
    const itemResponse = yield* HttpClient.patch(`/receipts/${receipt.id}/items/5`, {
      body: yield* HttpBody.json({ name: "Pears" }),
    });
    expect(itemResponse.status).toBe(404);
    expect(yield* itemResponse.json).toEqual({ _tag: "NotFound" });
  }).pipe(
    Effect.provide(
      testLayer({ update: () => Effect.succeedNone, updateItem: () => Effect.succeedNone }),
    ),
  ),
);

it.effect("returns HTTP 500 without exposing correction failure details", () =>
  Effect.gen(function* () {
    for (const [url, payload] of [
      [`/receipts/${receipt.id}`, { storeName: "Corner Store" }],
      [`/receipts/${receipt.id}/items/${itemId}`, { name: "Pears" }],
    ] as const) {
      const response = yield* HttpClient.patch(url, { body: yield* HttpBody.json(payload) });
      expect(response.status).toBe(500);
      const text = yield* response.text;
      expect(text).not.toContain("private database details");
      expect(JSON.parse(text)).toEqual({ _tag: "InternalServerError" });
    }
  }).pipe(
    Effect.provide(
      testLayer({
        update: () =>
          Effect.fail(
            new ReceiptRepository.PersistenceError({
              operation: "update",
              cause: "private database details",
            }),
          ),
        updateItem: () =>
          Effect.fail(
            new ReceiptRepository.PersistenceError({
              operation: "updateItem",
              cause: "private database details",
            }),
          ),
      }),
    ),
  ),
);
