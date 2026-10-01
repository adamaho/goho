import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { ReceiptUpload, ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { CreateReceiptRequest, Receipt, ReceiptId } from "@goho/goho-api/receipts";
import * as Client from "@goho/goho-server-client/client";
import { Array, Effect, Layer } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { HttpApiError } from "effect/unstable/httpapi";
import { expect } from "vitest";

import * as Http from "#src/http.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";

const createPayload = CreateReceiptRequest.make({
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  category: "Groceries",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: null,
  items: [{ name: "Apples", amount: "11" }],
});

const receipt = Receipt.make({
  ...createPayload,
  currency: "CAD",
  id: ReceiptId.make("42"),
  items: Array.map(createPayload.items, (item, position) => ({ ...item, position })),
});

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
) =>
  HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide([
        Receipts.layer.pipe(
          Layer.provide(
            Layer.succeed(ReceiptRepository.Service, {
              findById: () => Effect.succeedSome(receipt),
              insert: () => Effect.succeed(receipt.id),
              list: Effect.succeed([receipt]),
              ...repository,
            }),
          ),
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
        items: [{ name: "Apples", amount: "12.00" }],
      }),
    });
    expect(
      inserted.map(({ subtotal, tax, total, items }) => ({ subtotal, tax, total, items })),
    ).toEqual([
      { subtotal: "10.25", tax: "0.75", total: "11", items: [{ name: "Apples", amount: "12" }] },
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

it.effect("rejects invalid receipt data at the HTTP boundary", () =>
  Effect.gen(function* () {
    for (const payload of [
      {
        storeName: "Example Store",
        receiptDate: "2024-02-30",
        category: "Groceries",
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        currency: null,
        items: [{ name: "Apples", amount: "11" }],
      },
      {
        storeName: "Example Store",
        receiptDate: "2024-09-01",
        category: "Groceries",
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        currency: null,
        items: [],
      },
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
                create: () => Effect.die("Health must not create receipts"),
                get: () => Effect.die("Health must not get receipts"),
                list: Effect.die("Health must not list receipts"),
              }),
              receiptUploadsTest(),
            ]),
          ),
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest)),
      ),
    ),
);
