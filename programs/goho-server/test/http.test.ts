import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import * as Client from "@goho/goho-server-client/client";
import { CreateReceiptRequest, Receipt } from "@goho/goho-server-client/receipts";
import { Array, Effect, Layer, Option } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { expect } from "vitest";

import * as Http from "#src/http.ts";
import * as ReceiptRepository from "#src/receipts/repository.ts";
import * as Receipts from "#src/receipts/service.ts";
import * as ReceiptDependencies from "#test/receipts/dependencies.ts";

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
  id: "42",
  items: Array.map(createPayload.items, (item, position) => ({ ...item, position })),
});

const testLayer = (repository: Partial<ReceiptRepository.Interface> = {}) =>
  HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide(
        Receipts.layer.pipe(
          Layer.provide(
            ReceiptDependencies.layer({
              repository: {
                create: () => Effect.succeed(receipt),
                findById: () => Effect.succeed(Option.some(receipt)),
                list: () => Effect.succeed([receipt]),
                ...repository,
              },
              googleDrive: {
                listFiles: () =>
                  Effect.succeed([{ id: "receipt-1", name: "receipt.png", mimeType: "image/png" }]),
              },
            }),
          ),
        ),
      ),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const TestLive = testLayer();

it.effect("creates a receipt through the generated client and returns the complete receipt", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const result = yield* client.receipts.create({
      headers: { "idempotency-key": "manual-entry-1" },
      payload: createPayload,
    });
    expect(result).toEqual({ data: receipt });
  }).pipe(Effect.provide(TestLive)),
);

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

it.effect("returns HTTP 404 when a receipt does not exist", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(`/receipts/${receipt.id}`);
    expect(response.status).toBe(404);
  }).pipe(Effect.provide(testLayer({ findById: () => Effect.succeed(Option.none()) }))),
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
        list: () =>
          Effect.fail(
            new ReceiptRepository.PersistenceError({
              operation: "list",
              cause: "private database details",
            }),
          ),
      }),
    ),
  ),
);

it.effect("requires an idempotency key before dispatching receipt creation", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json(createPayload);
    const response = yield* HttpClient.post("/receipts", { body });
    expect(response.status).toBe(400);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("returns HTTP 409 when the repository reports an idempotency conflict", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json(createPayload);
    const response = yield* HttpClient.post("/receipts", {
      body,
      headers: { "idempotency-key": "manual-entry-1" },
    });
    expect(response.status).toBe(409);
  }).pipe(
    Effect.provide(
      testLayer({
        create: (idempotencyKey) =>
          Effect.fail(new ReceiptRepository.IdempotencyConflict({ idempotencyKey })),
      }),
    ),
  ),
);

it.effect("returns HTTP 500 without exposing private repository failure details", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json(createPayload);
    const response = yield* HttpClient.post("/receipts", {
      body,
      headers: { "idempotency-key": "manual-entry-1" },
    });
    expect(response.status).toBe(500);
    expect(yield* response.text).not.toContain("private database details");
  }).pipe(
    Effect.provide(
      testLayer({
        create: () =>
          Effect.fail(
            new ReceiptRepository.PersistenceError({
              operation: "create",
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
      const response = yield* HttpClient.post("/receipts", {
        body,
        headers: { "idempotency-key": "manual-entry-1" },
      });
      expect(response.status).toBe(400);
    }
  }).pipe(Effect.provide(TestLive)),
);

it.effect("round-trips receipt results through the generated client without authentication", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const result = yield* client.receipts.process({
      payload: { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 5 },
    });
    expect(result).toEqual({
      data: [{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }],
    });
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rejects invalid request inputs at the HTTP boundary", () =>
  Effect.gen(function* () {
    for (const payload of [
      { rootFolderId: "", spreadsheetId: "sheet", concurrency: 1 },
      { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 6 },
      { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 1.5 },
    ]) {
      const body = yield* HttpBody.json(payload);
      const response = yield* HttpClient.post("/receipts/process", {
        body,
      });
      expect(response.status).toBe(400);
    }
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
            Layer.provide(
              Layer.succeed(Receipts.Service, {
                create: () => Effect.die("Health must not create receipts"),
                get: () => Effect.die("Health must not get receipts"),
                list: () => Effect.die("Health must not list receipts"),
                process: () => Effect.die("Health must not process receipts"),
              }),
            ),
          ),
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest)),
      ),
    ),
);
