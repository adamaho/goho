/**
 * A saved receipt used by MCP tests.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const receipt = {
  id: "42",
  storeName: "North Star Market",
  receiptDate: "2026-09-10",
  category: "Groceries",
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  items: [{ position: 0, name: "Apples", amount: "4.5" }],
};

/**
 * Input corresponding to the saved receipt fixture.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const createPayload = {
  storeName: "North Star Market",
  receiptDate: "2026-09-10",
  category: "Groceries",
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  items: [{ name: "Apples", amount: "4.5" }],
};
