import { NodeRuntime } from "@effect/platform-node";
import type { CreateBookRequest } from "@goho/goho-server-client/books";
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

// Varied categories, optional reading levels and one long title for list layout checks.
const books: ReadonlyArray<CreateBookRequest> = [
  { title: "The Wild Robot", author: "Peter Brown", category: "Fiction", readingLevel: "Grade 3" },
  { title: "Dog Man", author: "Dav Pilkey", category: "Graphic novel", readingLevel: "Ages 7–10" },
  {
    title: "The Way Things Work Now: From Levers to Lasers, Windmills to Wi-Fi",
    author: "David Macaulay",
    category: "Nonfiction",
  },
  { title: "Charlotte's Web", author: "E. B. White", category: "Fiction", readingLevel: "Grade 4" },
  { title: "Where the Sidewalk Ends", author: "Shel Silverstein", category: "Poetry" },
];

Effect.gen(function* () {
  const baseUrl = yield* Config.String("GOHO_SERVER_URL").pipe(
    Config.withDefault("http://127.0.0.1:3000"),
  );
  const client = yield* make(baseUrl);

  // Receipts and books seed independently, so either can be added to an existing database.
  const seedReceipts = Effect.gen(function* () {
    // Receipt creation is not idempotent, so only seed an empty receipt list.
    const existing = yield* client.receipts.list();
    if (existing.data.length > 0) {
      return yield* Console.log("Skipped receipts because receipts already exist");
    }
    for (const payload of receipts) {
      const response = yield* client.receipts.create({ payload });
      yield* Console.log(`Seeded ${response.data.storeName} (receipt ${response.data.id})`);
    }
  });
  // Creating a saved title and author returns that book unchanged, so reruns add nothing.
  const seedBooks = Effect.gen(function* () {
    for (const payload of books) {
      const response = yield* client.books.create({ payload });
      yield* Console.log(`Book ready: ${response.data.title} (book ${response.data.id})`);
    }
  });

  yield* seedReceipts;
  yield* seedBooks;
}).pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain);
