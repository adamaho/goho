const groceries = {
  id: "3",
  name: "groceries",
  icon: "groceries",
  color: "green",
  kinds: ["receipt"],
};

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
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  categories: [groceries],
  items: [{ id: "7", position: 0, name: "Apples", amount: "4.5", category: groceries }],
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
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  items: [{ name: "Apples", amount: "4.5", category: "Groceries" }],
};
