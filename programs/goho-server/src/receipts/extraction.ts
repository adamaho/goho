import { Ai } from "@goho/core";
import { Effect } from "effect";

import { ParsedReceipt } from "./model.ts";

const systemPrompt = `Extract the receipt into the required structured receipt object.
- Expand recognizable abbreviations in store names and item names.
- Expand purchases with a quantity greater than one into one item entry per unit.
- Exclude purchased quantities such as (2) from each expanded item name.
- Associate item-specific sale, discount, coupon, and TPD/<item number> adjustment lines with the referenced item and subtract the adjustment from that item's price.
- Do not return sale, discount, coupon, or adjustment lines as separate item entries. Ignore them when they cannot be associated with a specific item.
- Apply item-specific adjustments before expanding quantities. When a quantity line shows a combined price, divide the adjusted total evenly across the expanded item entries so their prices sum to the adjusted line total.
- Infer one transaction category from the purchased items.
- Format the receipt date as YYYY-MM-DD.
- Return all prices, subtotal, tax, and total as numeric values without currency symbols.
- Preserve monetary values exactly as displayed on the receipt; do not convert currencies.
- Ignore payment methods, loyalty identifiers, and unrelated barcodes unless they are needed to identify the store or receipt date.`;

/**
 * Extracts structured receipt data from one supported image.
 *
 * @category workflows
 * @since 0.1.0
 */
export const extract = Effect.fn("@goho/Receipts.extract")(function* (input: {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentType: string;
}) {
  const ai = yield* Ai.Service;
  return yield* ai.generateObject({
    objectName: "receipt",
    schema: ParsedReceipt,
    prompt: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the structured receipt data from this image." },
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
