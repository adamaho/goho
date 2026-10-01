import { it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import { expect } from "vitest";

import { ParsedReceipt, prepareReceipt } from "#src/receipts/model.ts";

import { parsedReceipt } from "./fixtures.ts";

it.effect("requires a defined three-letter currency in extracted receipts", () =>
  Effect.gen(function* () {
    const { currency: _, ...transaction } = parsedReceipt.transaction;
    const invalidTransactions = [
      transaction,
      ...[null, "", "cad", "CA", "CAD "].map((currency) => ({ ...transaction, currency })),
    ];
    for (const transaction of invalidTransactions) {
      const result = yield* Schema.decodeUnknownEffect(ParsedReceipt)({
        ...parsedReceipt,
        transaction,
      }).pipe(Effect.result);
      expect(Result.isFailure(result)).toBe(true);
    }
  }),
);

it.effect("preserves extracted currencies and amounts when preparing receipts", () =>
  Effect.gen(function* () {
    for (const currency of ["CAD", "USD", "EUR"]) {
      const parsed = yield* Schema.decodeEffect(ParsedReceipt)({
        ...parsedReceipt,
        transaction: { ...parsedReceipt.transaction, currency },
      });
      const receipt = prepareReceipt(parsed);
      expect(receipt.currency).toBe(currency);
      expect([receipt.subtotal, receipt.tax, receipt.total]).toEqual(["10.25", "0.75", "11"]);
      expect(receipt.items.map((item) => item.amount)).toEqual([
        "0.3333333333333333",
        "0.3333333333333333",
        "-1",
      ]);
    }
  }),
);
