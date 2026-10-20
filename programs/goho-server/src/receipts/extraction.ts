import { Ai } from "@goho/core";
import { type Array, Effect, Schema } from "effect";

import { parsedReceiptWith } from "./model.ts";

const systemPrompt = `Extract the receipt into the required structured receipt object.
- Return store.name as the merchant's name only, as a customer would say it (for example "Ayr Foodland"). Exclude addresses, phone numbers, websites, store or branch numbers, and location suffixes.
- Expand recognizable abbreviations in store names and item names.
- Keep each item name to what the receipt prints. Expand abbreviations only when the meaning is clear, and do not add brands, sizes, varieties, or other details the receipt does not show. Keep the printed text when an abbreviation is ambiguous.
- Expand purchases with a quantity greater than one into one item entry per unit.
- Exclude purchased quantities such as (2) from each expanded item name.
- Associate item-specific sale, discount, coupon, and TPD/<item number> adjustment lines with the referenced item and subtract the adjustment from that item's price.
- Do not return sale, discount, coupon, or adjustment lines as separate item entries. Ignore them when they cannot be associated with a specific item.
- Apply item-specific adjustments before expanding quantities. When a quantity line shows a combined price, divide the adjusted total evenly across the expanded item entries so their prices sum to the adjusted line total.
- Give each item exactly one category, choosing the closest fit for that item from the allowed categories supplied with the image. Expanded entries keep their item's category.
- Format the receipt date as YYYY-MM-DD.
- Read numeric dates in the order printed by the merchant. Respect explicit format labels (YY/MM/DD, DD/MM/YY, MM/DD/YY), month names, and four-digit years before using contextual clues.
- Two-digit years can appear FIRST. For example, 26/10/11 in YY/MM/DD format means 2026-10-11, not 2011-10-26. Do not assume the last number is always the year.
- When an unlabelled numeric date has multiple valid interpretations, use the upload date supplied with the image to resolve the year and date order: prefer a plausible recent purchase on or before that date over a decades-old or future interpretation. For an upload on 2026-10-11, unlabelled 26/10/11 means 2026-10-11. This is only a tie-breaker: preserve clearly printed historical dates and explicit format labels, and never substitute the upload date for a missing receipt date.
- Return transaction.currency as a required uppercase three-letter currency code (for example CAD, USD, or EUR), never null or omitted.
- Identify the currency from explicit codes or symbols and the store's location. A bare $ symbol alone does not establish USD. Use CAD when the receipt provides no clues that identify another currency.
- Return all prices, subtotal, tax, and total as numeric values without currency symbols.
- Preserve monetary values exactly as displayed on the receipt; do not convert currencies.
- Ignore payment methods, loyalty identifiers, and unrelated barcodes unless they are needed to identify the store or receipt date.`;

/**
 * Extracts structured receipt data from one supported image. Each item category
 * must be one of `categories`; any other value fails as invalid model output.
 *
 * @category workflows
 * @since 0.1.0
 */
export const extract = Effect.fn("@goho/Receipts.extract")(function* (input: {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentType: string;
  readonly uploadedAt: string;
  readonly categories: Array.NonEmptyReadonlyArray<string>;
}) {
  const ai = yield* Ai.Service;
  return yield* ai.generateObject({
    objectName: "receipt",
    schema: parsedReceiptWith(Schema.Literals(input.categories)),
    prompt: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract the structured receipt data from this image. The receipt was uploaded at ${input.uploadedAt}. Use this only as context for ambiguous numeric dates.`,
          },
          {
            type: "text",
            text: `Allowed item categories, as a JSON array: ${JSON.stringify(input.categories)}`,
          },
          {
            type: "file",
            mediaType: input.contentType,
            fileName: input.fileName,
            data: input.bytes,
          },
        ],
      },
    ],
  });
});
