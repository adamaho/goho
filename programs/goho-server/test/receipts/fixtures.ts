import { ParsedReceipt, prepareReceipt } from "../../src/receipts/model.ts";

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

export const receipt = prepareReceipt(parsedReceipt, {
  provider: "google_drive",
  fileId: "receipt-1",
  fileName: "receipt.png",
});
