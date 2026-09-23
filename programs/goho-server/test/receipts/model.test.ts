import { Schema } from "effect";
import { expect, it } from "vitest";

import { ParsedReceipt } from "#src/receipts/model.ts";

import { parsedReceipt } from "./fixtures.ts";

it("accepts a valid receipt date before 2025", () => {
  const result = Schema.decodeSync(ParsedReceipt)({ ...parsedReceipt, date: "2024-02-29" });
  expect(result.date).toBe("2024-02-29");
});
