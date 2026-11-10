/**
 * A saved recipe used by MCP tests. Its ID is above 2^53, so rounding it through a number would
 * change it.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const recipe = {
  id: "9007199254740993",
  title: "Pancakes",
  source: null,
  totalTimeSeconds: 1800,
  hasImage: false,
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:00:00.000Z",
  ingredients: [
    {
      id: "flour",
      name: "all-purpose flour",
      quantity: { kind: "exact", value: { numerator: 3, denominator: 2 } },
      unit: "cup",
    },
    {
      id: "milk",
      name: "milk",
      quantity: {
        kind: "range",
        min: { numerator: 1, denominator: 1 },
        max: { numerator: 5, denominator: 4 },
      },
      unit: "cup",
    },
    { id: "salt", name: "salt", quantity: { kind: "text", text: "to taste" }, unit: null },
  ],
  steps: [
    {
      segments: [
        { kind: "text", text: "Whisk " },
        {
          kind: "mark",
          content: {
            kind: "ingredient",
            ingredientId: "flour",
            portion: { numerator: 1, denominator: 2 },
          },
        },
        { kind: "text", text: " with " },
        { kind: "mark", content: { kind: "text", text: "a pinch" } },
        { kind: "text", text: " of salt." },
      ],
    },
  ],
  yield: {
    quantity: { kind: "exact", value: { numerator: 4, denominator: 1 } },
    label: "servings",
  },
};

/**
 * The saved recipe fixture's headline, as recipe listings return it.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const recipeSummary = {
  id: recipe.id,
  title: recipe.title,
  source: recipe.source,
  totalTimeSeconds: recipe.totalTimeSeconds,
  hasImage: recipe.hasImage,
  createdAt: recipe.createdAt,
  updatedAt: recipe.updatedAt,
};

/**
 * Input that saves the recipe fixture, as the Goho API receives it.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const createRecipePayload = {
  title: recipe.title,
  ingredients: recipe.ingredients,
  steps: recipe.steps,
  yield: recipe.yield,
  totalTimeSeconds: recipe.totalTimeSeconds,
};
