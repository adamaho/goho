import { NodeRuntime } from "@effect/platform-node";
import type { CreateBookRequest } from "@goho/goho-server-client/books";
import { make } from "@goho/goho-server-client/client";
import type { CreateReceiptRequest } from "@goho/goho-server-client/receipts";
import type {
  CreateRecipeRequest,
  Quantity,
  Segment,
  Step,
} from "@goho/goho-server-client/recipes";
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

const exact = (numerator: number, denominator = 1): Quantity => ({
  kind: "exact",
  value: { numerator, denominator },
});

const range = (min: number, max: number): Quantity => ({
  kind: "range",
  min: { numerator: min, denominator: 1 },
  max: { numerator: max, denominator: 1 },
});

const text = (value: string): Segment => ({ kind: "text", text: value });

// Marks `numerator/denominator` of an ingredient; all of it by default.
const use = (ingredientId: string, numerator = 1, denominator = 1): Segment => ({
  kind: "mark",
  content: { kind: "ingredient", ingredientId, portion: { numerator, denominator } },
});

const marked = (value: string): Segment => ({
  kind: "mark",
  content: { kind: "text", text: value },
});

const step = (first: Segment, ...rest: ReadonlyArray<Segment>): Step => ({
  segments: [first, ...rest],
});

// Exact, range and text amounts, split ingredient portions, marked wording, and
// recipes with and without a yield or total time. Saved directly, so they have
// no source or photo.
const recipes: ReadonlyArray<CreateRecipeRequest> = [
  {
    title: "Buttermilk Pancakes",
    ingredients: [
      { id: "flour", name: "all-purpose flour", quantity: exact(3, 2), unit: "cup" },
      { id: "sugar", name: "sugar", quantity: exact(2), unit: "tablespoon" },
      { id: "baking-powder", name: "baking powder", quantity: exact(3, 2), unit: "teaspoon" },
      { id: "salt", name: "salt", quantity: exact(1), unit: "pinch" },
      { id: "buttermilk", name: "buttermilk", quantity: exact(5, 4), unit: "cup" },
      { id: "egg", name: "large egg", quantity: exact(1), unit: "count" },
      { id: "butter", name: "unsalted butter, melted", quantity: exact(45), unit: "gram" },
    ],
    steps: [
      step(
        text("Whisk "),
        use("flour"),
        text(", "),
        use("sugar"),
        text(", "),
        use("baking-powder"),
        text(" and "),
        use("salt"),
        text(" in a large bowl."),
      ),
      step(
        text("Beat "),
        use("buttermilk"),
        text(" with "),
        use("egg"),
        text(" and "),
        use("butter", 2, 3),
        text(", then fold into the dry mix until just combined."),
      ),
      step(
        text("Brush a hot pan with "),
        use("butter", 1, 3),
        text(" and cook "),
        marked("1/4 cup"),
        text(" of batter at a time, about "),
        marked("2 minutes"),
        text(" a side."),
      ),
    ],
    yield: { quantity: range(10, 12), label: "pancakes" },
    totalTimeSeconds: 1500,
  },
  {
    title: "Tomato Basil Soup",
    ingredients: [
      { id: "oil", name: "olive oil", quantity: exact(2), unit: "tablespoon" },
      { id: "onion", name: "onion, diced", quantity: exact(1), unit: "count" },
      { id: "garlic", name: "garlic, sliced", quantity: range(2, 3), unit: "clove" },
      { id: "tomatoes", name: "whole tomatoes (796 mL)", quantity: exact(2), unit: "can" },
      { id: "stock", name: "vegetable stock", quantity: exact(1, 2), unit: "litre" },
      { id: "basil", name: "fresh basil", quantity: exact(1), unit: "bunch" },
      {
        id: "pepper",
        name: "black pepper",
        quantity: { kind: "text", text: "to taste" },
        unit: null,
      },
    ],
    steps: [
      step(text("Warm "), use("oil"), text(" in a pot over medium heat.")),
      step(
        text("Soften "),
        use("onion"),
        text(" for 5 minutes, then add "),
        use("garlic"),
        text("."),
      ),
      step(
        text("Add "),
        use("tomatoes"),
        text(" and "),
        use("stock"),
        text(", simmer 20 minutes, then blend with "),
        use("basil", 1, 2),
        text("."),
      ),
      step(
        text("Season with "),
        use("pepper"),
        text(" and top with "),
        use("basil", 1, 2),
        text("."),
      ),
    ],
    yield: { quantity: exact(4), label: "servings" },
    totalTimeSeconds: 2700,
  },
  {
    title: "Lemon Vinaigrette",
    ingredients: [
      { id: "lemon", name: "lemon juice", quantity: exact(60), unit: "millilitre" },
      { id: "mustard", name: "Dijon mustard", quantity: exact(1), unit: "teaspoon" },
      { id: "oil", name: "extra-virgin olive oil", quantity: exact(1, 2), unit: "cup" },
      {
        id: "salt",
        name: "flaky salt",
        quantity: { kind: "text", text: "a good pinch" },
        unit: null,
      },
    ],
    steps: [
      step(
        text("Shake "),
        use("lemon"),
        text(", "),
        use("mustard"),
        text(", "),
        use("oil"),
        text(" and "),
        use("salt"),
        text(" in a jar until creamy."),
      ),
    ],
  },
];

Effect.gen(function* () {
  const baseUrl = yield* Config.String("GOHO_SERVER_URL").pipe(
    Config.withDefault("http://127.0.0.1:3000"),
  );
  const client = yield* make(baseUrl);

  // Receipts, books and recipes seed independently, so any of them can be added to an existing database.
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

  // Titles are not unique, so a fixture is skipped when a recipe with its exact
  // title already exists, whoever saved it. Nothing is ever deleted.
  const seedRecipes = Effect.gen(function* () {
    const existing = yield* client.recipes.list();
    const titles = new Set(existing.data.map(({ title }) => title));
    for (const payload of recipes) {
      if (titles.has(payload.title)) {
        yield* Console.log(`Skipped recipe ${payload.title} because one already has that title`);
        continue;
      }
      const response = yield* client.recipes.create({ payload });
      yield* Console.log(`Seeded ${response.data.title} (recipe ${response.data.id})`);
    }
  });

  yield* seedReceipts;
  yield* seedBooks;
  yield* seedRecipes;
}).pipe(Effect.provide(FetchHttpClient.layer), NodeRuntime.runMain);
