import { Schema } from "effect";

const Name = Schema.Trim.check(Schema.isNonEmpty());

const ReceiptDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(
    (value) => {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      const date = new Date(Date.UTC(year, month - 1, day));

      return (
        year >= 2025 &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    {
      expected: "a real calendar date in YYYY-MM-DD format with a year of 2025 or later",
      toJsonSchema: () => ({
        pattern: "^(?:202[5-9]|20[3-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})-\\d{2}-\\d{2}$",
      }),
    },
  ),
);

const _Receipt = Schema.Struct({
  store: Schema.Struct({
    name: Name,
  }),
  date: ReceiptDate,
  transaction: Schema.Struct({
    items: Schema.NonEmptyArray(
      Schema.Struct({
        name: Name,
        price: Schema.Finite,
      }),
    ),
    category: Name,
    subtotal: Schema.Finite,
    tax: Schema.Finite,
    total: Schema.Finite,
  }),
});

const _receiptSystemPrompt = `Extract the receipt into the required structured receipt object.

- Expand recognizable abbreviations in store names and item names.
- Represent discounts and TPD/<item number> adjustments as negative item prices.
- Infer one transaction category from the purchased items.
- Format the receipt date as YYYY-MM-DD.
- Return all prices, subtotal, tax, and total as numeric values without currency symbols.
- Preserve monetary values exactly as displayed on the receipt; do not convert currencies.
- Ignore payment methods, loyalty identifiers, and unrelated barcodes unless they are needed to identify the store or receipt date.`;

void _Receipt;
void _receiptSystemPrompt;
