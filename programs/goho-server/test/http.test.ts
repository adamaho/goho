import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import * as Client from "@goho/goho-server-client/client";
import { Receipt } from "@goho/goho-server-client/receipts";
import { Effect, Layer } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { expect } from "vitest";

import * as Http from "../src/http.ts";
import * as Receipts from "../src/receipts/service.ts";

const receipt = Receipt.make({
  id: "5bb54486-9d88-4df7-89d1-1f2c3b2de21c",
  storeName: "Example Store",
  receiptDate: "2024-09-01",
  category: "Groceries",
  subtotal: "10.25",
  tax: "0.75",
  total: "11",
  currency: null,
  items: [{ position: 0, name: "Apples", amount: "11" }],
});

const TestLive = HttpRouter.serve(
  Http.layer.pipe(
    Layer.provide(
      Layer.succeed(Receipts.Service, {
        create: () => Effect.succeed(receipt),
        process: () =>
          Effect.succeed([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]),
      }),
    ),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("creates a receipt through the generated client and returns the complete receipt", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const result = yield* client.receipts.create({
      headers: { "idempotency-key": "manual-entry-1" },
      payload: {
        storeName: "Example Store",
        receiptDate: "2024-09-01",
        category: "Groceries",
        subtotal: "10.25",
        tax: "0.75",
        total: "11",
        currency: null,
        items: [{ name: "Apples", amount: "11" }],
      },
    });
    expect(result).toEqual(receipt);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("requires an idempotency key before dispatching receipt creation", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json({
      storeName: "Example Store",
      receiptDate: "2024-09-01",
      category: "Groceries",
      subtotal: "10.25",
      tax: "0.75",
      total: "11",
      currency: null,
      items: [{ name: "Apples", amount: "11" }],
    });
    const response = yield* HttpClient.post("/receipts", { body });
    expect(response.status).toBe(400);
  }).pipe(Effect.provide(TestLive)),
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
