import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import * as Client from "@goho/goho-server-client/client";
import { CreateReceiptRequest, Receipt } from "@goho/goho-server-client/receipts";
import { Array, Effect, Layer } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { expect } from "vitest";

import * as Http from "#src/http.ts";
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
  id: "5bb54486-9d88-4df7-89d1-1f2c3b2de21c",
  items: Array.map(createPayload.items, (item, position) => ({ ...item, position })),
});

const testLayer = (create: ReceiptRepository.Interface["create"] = () => Effect.succeed(receipt)) =>
  HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide(
        Layer.effect(
          Receipts.Service,
          Receipts.make(
            () =>
              Effect.succeed([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]),
            { create },
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
    expect(result).toEqual(receipt);
  }).pipe(Effect.provide(TestLive)),
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
      testLayer((idempotencyKey) =>
        Effect.fail(new ReceiptRepository.IdempotencyConflict({ idempotencyKey })),
      ),
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
      testLayer(() =>
        Effect.fail(
          new ReceiptRepository.PersistenceError({
            operation: "create",
            cause: "private database details",
          }),
        ),
      ),
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
    expect(result).toEqual([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]);
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
