import { Recipe } from "@goho/goho-api/recipes";
import { Schema } from "effect";

const decode = Schema.decodeUnknownSync(Recipe);

const exact = (numerator: number, denominator = 1) => ({
  kind: "exact",
  value: { numerator, denominator },
});

const range = (min: readonly [number, number], max: readonly [number, number]) => ({
  kind: "range",
  min: { numerator: min[0], denominator: min[1] },
  max: { numerator: max[0], denominator: max[1] },
});

const text = (value: string) => ({ kind: "text", text: value });

const mark = (ingredientId: string, numerator = 1, denominator = 1) => ({
  kind: "mark",
  content: { kind: "ingredient", ingredientId, portion: { numerator, denominator } },
});

const textMark = (value: string) => ({ kind: "mark", content: { kind: "text", text: value } });

const saved = {
  id: "7",
  source: { kind: "url", url: "https://examplekitchen.com/lemon-orzo?ref=goho" },
  hasImage: false,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
};

/**
 * A saved recipe that touches every amount and mark rule the app formats, with
 * a source URL the PDF ends with.
 *
 * @category models
 * @since 0.1.0
 */
export const recipe: Recipe = decode({
  ...saved,
  title: "Crème Fraîche Lemon Orzo",
  totalTimeSeconds: 4200,
  yield: { quantity: range([4, 1], [6, 1]), label: "servings" },
  ingredients: [
    { id: "stock", name: "chicken stock", quantity: exact(5, 2), unit: "cup" },
    { id: "orzo", name: "orzo", quantity: exact(45_359_237, 100_000), unit: "gram" },
    { id: "milk", name: "milk", quantity: range([1, 1], [2, 1]), unit: "cup" },
    {
      id: "butter",
      name: "unsalted butter, cubed",
      quantity: range([3, 1], [6, 1]),
      unit: "tablespoon",
    },
    { id: "eggs", name: "eggs", quantity: exact(3), unit: "count" },
    { id: "zest", name: "lemon zest", quantity: exact(1, 5), unit: "teaspoon" },
    { id: "saffron", name: "saffron", quantity: exact(1, 1000), unit: "gram" },
    { id: "cream", name: "crème fraîche", quantity: exact(251, 250), unit: "cup" },
    { id: "jalapeno", name: "jalapeño, minced", quantity: exact(1, 2), unit: "count" },
    { id: "salt", name: "salt", quantity: text("to taste"), unit: null },
  ],
  steps: [
    {
      segments: [
        { kind: "text", text: "Heat the oven to 350°F (175°C). Bring " },
        mark("stock", 1, 2),
        { kind: "text", text: " to a simmer." },
      ],
    },
    {
      segments: [
        { kind: "text", text: "Melt " },
        mark("butter", 1, 3),
        { kind: "text", text: ", then stir in " },
        mark("orzo"),
        { kind: "text", text: " and " },
        mark("salt", 1, 2),
        { kind: "text", text: "." },
      ],
    },
    {
      segments: [
        { kind: "text", text: "Whisk " },
        mark("eggs"),
        { kind: "text", text: " with " },
        mark("milk", 1, 2),
        { kind: "text", text: ", " },
        mark("cream"),
        { kind: "text", text: " and " },
        textMark("a good squeeze"),
        { kind: "text", text: " of lemon.  Season with " },
        mark("salt"),
        { kind: "text", text: "." },
      ],
    },
  ],
});

const longWord = "Supercalifragilisticexpialidocious".repeat(4);

/**
 * A recipe long enough for several pages, with a long title, an unbreakable
 * word and a hard line break.
 *
 * @category models
 * @since 0.1.0
 */
export const longRecipe: Recipe = decode({
  ...saved,
  title:
    "Grandma’s Extraordinarily Long Sunday Afternoon Slow-Braised Short Ribs with Root Vegetables, Gremolata and Crème Fraîche Mashed Potatoes",
  totalTimeSeconds: 30,
  yield: { quantity: text("about 2 dozen"), label: "pieces" },
  ingredients: Array.from({ length: 40 }, (_, index) => ({
    id: `ingredient-${index + 1}`,
    name:
      index % 7 === 0
        ? `ingredient ${index + 1}, trimmed, patted dry and cut into pieces roughly the size of a walnut for even browning`
        : `ingredient ${index + 1}`,
    quantity: exact(index + 1, 4),
    unit: index % 2 === 0 ? "cup" : "gram",
  })),
  steps: Array.from({ length: 24 }, (_, index) => ({
    segments: [
      {
        kind: "text",
        text:
          index === 3
            ? `Line one of step ${index + 1}.\nLine two after a break, then ${longWord} ends here. `
            : `Step ${index + 1}: stir gently and keep the heat low while the pot simmers, scraping the bottom now and then so nothing catches. `,
      },
      mark(`ingredient-${index + 1}`, 1, 2),
      {
        kind: "text",
        text:
          index % 3 === 0
            ? " goes in last, with care, and rests for about 2 minutes before serving."
            : ".",
      },
    ],
  })),
});
