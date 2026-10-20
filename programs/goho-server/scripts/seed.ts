import { NodeRuntime } from "@effect/platform-node";
import { make } from "@goho/goho-server-client/client";
import type { CreateReceiptRequest } from "@goho/goho-server-client/receipts";
import { Config, Console, Effect } from "effect";
import { FetchHttpClient } from "effect/http";

const receipts: ReadonlyArray<CreateReceiptRequest> = [
  {
    storeName: "North Star Market",
    receiptDate: "2026-09-10",
    subtotal: "21.50",
    tax: "1.72",
    total: "23.22",
    currency: "USD",
    items: [
      { name: "Apples", amount: "4.50", category: "Groceries" },
      { name: "Bread", amount: "5.00", category: "Groceries" },
      { name: "Coffee", amount: "12.00", category: "Groceries" },
    ],
  },
  {
    storeName: "Harbor Cafe",
    receiptDate: "2026-09-12",
    subtotal: "15.00",
    tax: "1.20",
    total: "16.20",
    currency: "USD",
    items: [
      { name: "Sandwich", amount: "11.50", category: "Dining" },
      { name: "Tea", amount: "3.50", category: "Dining" },
    ],
  },
  {
    storeName: "Railway Books",
    receiptDate: "2026-09-15",
    subtotal: "24.00",
    tax: "1.92",
    total: "25.92",
    currency: "USD",
    items: [
      { name: "Field Guide", amount: "18.00", category: "Books" },
      { name: "Notebook", amount: "6.00", category: "Shopping" },
    ],
  },
  {
    storeName: "Cedar Hardware",
    receiptDate: "2026-09-18",
    subtotal: "21.49",
    tax: "1.72",
    total: "23.21",
    currency: "USD",
    items: [
      { name: "Batteries", amount: "8.99", category: "Household" },
      { name: "Cable", amount: "12.50", category: "Household" },
    ],
  },
];

Effect.gen(function* () {
  const baseUrl = yield* Config.String("GOHO_SERVER_URL").pipe(
    Config.withDefault("http://127.0.0.1:3000"),
  );
  const client = yield* make(baseUrl);

  // Receipt creation is not idempotent, so only seed an empty database.
  const existing = yield* client.receipts.list();
  if (existing.data.length > 0) {
    return yield* Console.log("Skipped seeding because receipts already exist");
  }
  for (const payload of receipts) {
    const response = yield* client.receipts.create({ payload });
    yield* Console.log(`Seeded ${response.data.storeName} (receipt ${response.data.id})`);
  }
}).pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain);
