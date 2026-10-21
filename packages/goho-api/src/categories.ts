import { Schema } from "effect";

/**
 * Persisted category identity, kept as decimal text like other IDs.
 *
 * @category models
 * @since 0.1.0
 */
export const CategoryId = Schema.String.check(Schema.isPattern(/^[1-9]\d{0,18}$/u))
  .annotate({
    identifier: "CategoryId",
    description: "The category's positive number on the roster.",
    examples: ["3"],
  })
  .pipe(Schema.brand("CategoryId"));

/**
 * Decoded persisted category identity.
 *
 * @category models
 * @since 0.1.0
 */
export type CategoryId = typeof CategoryId.Type;

/**
 * Domain a category applies to. Receipt items and books draw from one shared
 * catalog; each category lists the domains it has been used in.
 *
 * @category models
 * @since 0.1.0
 */
export const CategoryKind = Schema.Literals(["receipt", "book"]).annotate({
  identifier: "CategoryKind",
  description: "Which lineup a category plays for: receipt items or books.",
});

/**
 * Domain a category applies to.
 *
 * @category models
 * @since 0.1.0
 */
export type CategoryKind = typeof CategoryKind.Type;

/**
 * Shared category with its display metadata and the domains it applies to.
 *
 * @category models
 * @since 0.1.0
 */
export const Category = Schema.Struct({
  id: CategoryId.annotateKey({ description: "The category's roster number." }),
  name: Schema.String.annotate({
    description: "Trimmed lowercase category name.",
    examples: ["groceries"],
  }),
  icon: Schema.String.annotate({
    description:
      "Icon identifier for showing the category. Any string can suit up, so pick a fallback for ones you don't know.",
    examples: ["groceries"],
  }),
  color: Schema.Literals([
    "green",
    "orange",
    "purple",
    "brown",
    "pink",
    "red",
    "blue",
    "yellow",
    "grey",
  ]).annotate({ description: "Stable colour key for showing the category." }),
  kinds: Schema.NonEmptyArray(CategoryKind)
    .check(Schema.isUnique())
    .annotate({
      description:
        "Each lineup the category plays for, once. Using a category for receipts or books adds it here.",
      examples: [["receipt"], ["receipt", "book"]],
    }),
}).annotate({
  identifier: "Category",
  description:
    "A category on the shared roster. New names suit up with the `other` icon and `grey` colour.",
  examples: [
    {
      id: CategoryId.make("3"),
      name: "groceries",
      icon: "groceries",
      color: "green",
      kinds: ["receipt"],
    },
  ],
});

/**
 * Decoded category.
 *
 * @category models
 * @since 0.1.0
 */
export interface Category extends Schema.Schema.Type<typeof Category> {}
