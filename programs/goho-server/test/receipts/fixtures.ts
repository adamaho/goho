import type { Ai } from "@goho/core";
import { Effect, Schema } from "effect";
import { AiError } from "effect/ai";

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
    currency: "CAD",
    items: [
      { name: "Apples (2)", price: 0.3333333333333333, category: "groceries" },
      { name: "Apples", price: 0.3333333333333333, category: "groceries" },
      { name: "Adjustment", price: -1, category: "groceries" },
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

/**
 * Fake model that returns `output` validated by the requested schema, failing
 * like the real model when the output does not match it.
 *
 * @category testing
 * @since 0.1.0
 */
export const generateObject =
  (output: unknown): Ai.Interface["generateObject"] =>
  ({ schema }) =>
    Schema.decodeUnknownEffect(schema)(output).pipe(
      Effect.mapError((error) =>
        AiError.make({
          module: "Test",
          method: "generateObject",
          reason: AiError.StructuredOutputError.fromSchemaError(error, JSON.stringify(output)),
        }),
      ),
    );
