import { Schema } from "effect";

import { Category, CategoryId } from "./categories.ts";

export {
  /**
   * Shared category with its display metadata and kinds, kept here for receipt
   * consumers. It is defined in `@goho/goho-api/categories`.
   *
   * @category models
   * @since 0.1.0
   */
  Category,
  /**
   * Persisted category identity, kept here for receipt consumers. It is defined
   * in `@goho/goho-api/categories`.
   *
   * @category models
   * @since 0.1.0
   */
  CategoryId,
};

const Name = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Nonempty text with the extra whitespace scraped off the boards.",
});

/**
 * Real calendar date encoded as YYYY-MM-DD.
 *
 * @category models
 * @since 0.1.0
 */
export const CalendarDate = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    {
      expected: "a real calendar date in YYYY-MM-DD format",
      toJsonSchema: () => ({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    },
  ),
).annotate({
  identifier: "CalendarDate",
  description: "A real calendar date in YYYY-MM-DD format, from year 0100 through 9999.",
  examples: ["2026-09-13"],
});

/**
 * Exact decimal text accepted by the receipt API.
 *
 * @category models
 * @since 0.1.0
 */
export const DecimalString = Schema.String.check(
  Schema.isPattern(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i, {
    // JSON Schema patterns have no flags; preserve the runtime's case-insensitive exponent.
    toJsonSchema: () => ({ pattern: "^-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$" }),
  }),
).annotate({
  identifier: "DecimalString",
  description: "An exact decimal kept as text so no precision gets lost in the shuffle.",
  examples: ["10.25", "-1.50", "1e2", "1E2"],
});

/**
 * Decoded exact decimal text.
 *
 * @category models
 * @since 0.1.0
 */
export type DecimalString = typeof DecimalString.Type;

// Trim is a codec; OpenAPI needs field metadata on its encoded string side.
const ReceiptFields = {
  storeName: Name.pipe(
    Schema.annotateEncoded({
      description: "Store or merchant named on the receipt.",
      examples: ["Example Store"],
    }),
  ),
  receiptDate: CalendarDate.annotateKey({ description: "Date the purchase hit the ice." }),
  subtotal: DecimalString.annotateKey({ description: "Amount before tax.", examples: ["10.25"] }),
  tax: DecimalString.annotateKey({ description: "Tax amount.", examples: ["0.75"] }),
  total: DecimalString.annotateKey({ description: "Final receipt total.", examples: ["11"] }),
  currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)).annotate({
    description:
      "Required three-letter currency code for all items and totals, bud. Codes are not checked against a registry.",
    examples: ["CAD", "USD"],
  }),
};

const ReceiptItemInput = Schema.Struct({
  name: Name.pipe(
    Schema.annotateEncoded({
      description: "Item name on the receipt.",
      examples: ["Apples"],
    }),
  ),
  amount: DecimalString.annotateKey({
    description: "Item amount; negative adjustments can suit up too.",
    examples: ["10.25"],
  }),
  category: Name.pipe(
    Schema.annotateEncoded({
      description:
        "Item category name. It is saved trimmed and lowercase; a name not on the roster yet joins it.",
      examples: ["Groceries"],
    }),
  ),
}).annotate({
  identifier: "ReceiptItemInput",
  description: "One receipt line item; repeat names are fair game.",
  examples: [{ name: "Apples", amount: "10.25", category: "Groceries" }],
});

/**
 * Receipt data accepted by the generic creation endpoint. Array order defines item order.
 *
 * @category models
 * @since 0.1.0
 */
export const CreateReceiptRequest = Schema.Struct({
  ...ReceiptFields,
  items: Schema.NonEmptyArray(ReceiptItemInput).annotate({
    description: "Line items in receipt order.",
  }),
}).annotate({
  identifier: "CreateReceiptRequest",
  description:
    "The full receipt lineup, bud. Names are trimmed and stay nonempty; amounts are not rounded, converted, or checked against the totals.",
  examples: [
    {
      storeName: "Example Store",
      receiptDate: "2026-09-13",
      subtotal: "10.25",
      tax: "0.75",
      total: "11.00",
      currency: "USD",
      items: [{ name: "Apples", amount: "10.25", category: "Groceries" }],
    },
  ],
});

/**
 * Decoded receipt creation input.
 *
 * @category models
 * @since 0.1.0
 */
export interface CreateReceiptRequest extends Schema.Schema.Type<typeof CreateReceiptRequest> {}

const maxId = 9_223_372_036_854_775_807n;

const BigintId = Schema.String.check(
  // Abort on a bad format so `BigInt` never sees non-digits, even with `errors: "all"`.
  Schema.isPattern(/^[1-9]\d{0,18}$/u).abort(),
  Schema.makeFilter((value) => BigInt(value) <= maxId, {
    expected: `an ID no greater than ${maxId}`,
    // JSON Schema has no numeric bound for strings; the description states the range.
    toJsonSchema: () => ({}),
  }),
);

/**
 * Persisted receipt identity: canonical positive decimal text within
 * PostgreSQL `bigint` range, kept as a string so clients cannot round it.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptId = BigintId.annotate({
  identifier: "ReceiptId",
  description: `The receipt's positive number on the roster, from 1 through ${maxId} without leading zeros, bud.`,
  examples: ["42"],
}).pipe(Schema.brand("ReceiptId"));

/**
 * Decoded persisted receipt identity.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptId = typeof ReceiptId.Type;

/**
 * Receipt corrections. Only supplied fields change; at least one is required.
 * The HTTP contract also rejects unsupported properties.
 *
 * @category models
 * @since 0.1.0
 */
export const PatchReceiptRequest = Schema.Struct({
  storeName: Schema.optionalKey(ReceiptFields.storeName),
  receiptDate: Schema.optionalKey(ReceiptFields.receiptDate),
})
  .check(Schema.isMinProperties(1))
  .annotate({
    identifier: "PatchReceiptRequest",
    description:
      "Receipt details to correct, bud. Send at least one field; left-out fields stay put, and names are trimmed and stay nonempty.",
    examples: [{ receiptDate: "2026-09-14" }, { storeName: "Corner Store" }],
  });

/**
 * Decoded receipt corrections.
 *
 * @category models
 * @since 0.1.0
 */
export interface PatchReceiptRequest extends Schema.Schema.Type<typeof PatchReceiptRequest> {}

/**
 * Item name and category corrections. Only supplied fields change; at least one
 * is required. The HTTP contract also rejects unsupported properties.
 *
 * @category models
 * @since 0.1.0
 */
export const PatchReceiptItemRequest = Schema.Struct({
  name: Schema.optionalKey(ReceiptItemInput.fields.name),
  category: Schema.optionalKey(ReceiptItemInput.fields.category),
})
  .check(Schema.isMinProperties(1))
  .annotate({
    identifier: "PatchReceiptItemRequest",
    description:
      "Line item details to correct. Send a name, a category, or both; left-out fields stay put, and values are trimmed and stay nonempty.",
    examples: [{ name: "Granny Smith apples" }, { category: "Groceries" }],
  });

/**
 * Decoded item corrections.
 *
 * @category models
 * @since 0.1.0
 */
export interface PatchReceiptItemRequest extends Schema.Schema.Type<
  typeof PatchReceiptItemRequest
> {}

/**
 * Persisted receipt item identity: canonical positive decimal text within
 * PostgreSQL `bigint` range, kept as a string so clients cannot round it.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptItemId = BigintId.annotate({
  identifier: "ReceiptItemId",
  description: `The item's positive number on the roster, from 1 through ${maxId} without leading zeros. It sticks with the item through renames.`,
  examples: ["7"],
}).pipe(Schema.brand("ReceiptItemId"));

/**
 * Decoded persisted receipt item identity.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptItemId = typeof ReceiptItemId.Type;

const groceries = Category.make({
  id: CategoryId.make("3"),
  name: "groceries",
  icon: "groceries",
  color: "green",
  kinds: ["receipt"],
});

/**
 * Saved receipt line item, returned within a receipt or alone after a correction.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptItem = Schema.Struct({
  id: ReceiptItemId.annotateKey({
    description: "The item's roster number; use it to target this item.",
  }),
  position: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
    description: "Zero-based spot in the receipt lineup.",
    examples: [0],
  }),
  name: ReceiptItemInput.fields.name,
  amount: ReceiptItemInput.fields.amount,
  category: Category.annotateKey({ description: "The item's category." }),
}).annotate({
  identifier: "ReceiptItem",
  description: "A saved receipt line item in its original slot.",
  examples: [
    {
      id: ReceiptItemId.make("7"),
      position: 0,
      name: "Apples",
      amount: "10.25",
      category: groceries,
    },
  ],
});

/**
 * Decoded saved receipt line item.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptItem extends Schema.Schema.Type<typeof ReceiptItem> {}

/**
 * Complete receipt returned after creation or an idempotent replay.
 *
 * @category models
 * @since 0.1.0
 */
export const Receipt = Schema.Struct({
  id: ReceiptId.annotateKey({
    description: "The receipt's roster number, kept the same on a replay.",
  }),
  ...ReceiptFields,
  categories: Schema.NonEmptyArray(Category).annotate({
    description: "Each distinct item category once, in order of first appearance.",
  }),
  items: Schema.NonEmptyArray(ReceiptItem).annotate({
    description: "Items lined up by ascending position.",
  }),
}).annotate({
  identifier: "Receipt",
  description:
    "A saved receipt with trimmed names and normalized decimals; `11.00` comes back as `11`, beauty.",
  examples: [
    {
      id: ReceiptId.make("42"),
      storeName: "Example Store",
      receiptDate: "2026-09-13",
      subtotal: "10.25",
      tax: "0.75",
      total: "11",
      currency: "USD",
      categories: [groceries],
      items: [
        {
          id: ReceiptItemId.make("7"),
          position: 0,
          name: "Apples",
          amount: "10.25",
          category: groceries,
        },
      ],
    },
  ],
});

/**
 * Complete persisted receipt.
 *
 * @category models
 * @since 0.1.0
 */
export interface Receipt extends Schema.Schema.Type<typeof Receipt> {}
