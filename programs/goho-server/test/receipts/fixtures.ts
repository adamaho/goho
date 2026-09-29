import { ParsedReceipt, prepareReceipt } from "#src/receipts/model.ts";

/**
 * Receipt fixture with repeated items and fractional amounts.
 *
 * @category models
 * @since 0.1.0
 */
export const parsedReceipt = ParsedReceipt.make({
  store: { name: "Example Store" },
  date: "2026-09-01",
  transaction: {
    category: "Groceries",
    items: [
      { name: "Apples (2)", price: 0.3333333333333333 },
      { name: "Apples", price: 0.3333333333333333 },
      { name: "Adjustment", price: -1 },
    ],
    subtotal: 10.25,
    tax: 0.75,
    total: 11,
  },
});

/**
 * Receipt data prepared from the extraction fixture.
 *
 * @category models
 * @since 0.1.0
 */
export const receipt = prepareReceipt(parsedReceipt);
