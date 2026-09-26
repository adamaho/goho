import { NodeRuntime } from "@effect/platform-node";
import { make } from "@goho/goho-server-client/client";
import { type CreateReceiptRequest, IdempotencyKey } from "@goho/goho-server-client/receipts";
import { Config, Console, Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

interface SeedReceipt {
  readonly key: IdempotencyKey;
  readonly payload: CreateReceiptRequest;
}

const receipts: ReadonlyArray<SeedReceipt> = [
  {
    key: IdempotencyKey.make("goho-dev-seed-v1-market"),
    payload: {
      storeName: "North Star Market",
      receiptDate: "2026-09-10",
      category: "Groceries",
      subtotal: "21.50",
      tax: "1.72",
      total: "23.22",
      currency: "USD",
      items: [
        { name: "Apples", amount: "4.50" },
        { name: "Bread", amount: "5.00" },
        { name: "Coffee", amount: "12.00" },
      ],
    },
  },
  {
    key: IdempotencyKey.make("goho-dev-seed-v1-cafe"),
    payload: {
      storeName: "Harbor Cafe",
      receiptDate: "2026-09-12",
      category: "Meals",
      subtotal: "15.00",
      tax: "1.20",
      total: "16.20",
      currency: "USD",
      items: [
        { name: "Sandwich", amount: "11.50" },
        { name: "Tea", amount: "3.50" },
      ],
    },
  },
  {
    key: IdempotencyKey.make("goho-dev-seed-v1-books"),
    payload: {
      storeName: "Railway Books",
      receiptDate: "2026-09-15",
      category: "Books",
      subtotal: "24.00",
      tax: "1.92",
      total: "25.92",
      currency: "USD",
      items: [
        { name: "Field Guide", amount: "18.00" },
        { name: "Notebook", amount: "6.00" },
      ],
    },
  },
  {
    key: IdempotencyKey.make("goho-dev-seed-v1-hardware"),
    payload: {
      storeName: "Cedar Hardware",
      receiptDate: "2026-09-18",
      category: "Supplies",
      subtotal: "21.49",
      tax: "1.72",
      total: "23.21",
      currency: "USD",
      items: [
        { name: "Batteries", amount: "8.99" },
        { name: "Cable", amount: "12.50" },
      ],
    },
  },
];

Effect.gen(function* () {
  const baseUrl = yield* Config.String("GOHO_SERVER_URL").pipe(
    Config.withDefault("http://127.0.0.1:3000"),
  );
  const client = yield* make(baseUrl);

  for (const receipt of receipts) {
    const response = yield* client.receipts.create({
      headers: { "idempotency-key": receipt.key },
      payload: receipt.payload,
    });
    yield* Console.log(`Seeded ${response.data.storeName} (receipt ${response.data.id})`);
  }
}).pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain);
