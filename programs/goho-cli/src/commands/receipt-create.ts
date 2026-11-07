import { CreateReceiptRequest } from "@goho/goho-server-client/receipts";
import { Console, Effect, Schema } from "effect";
import { Command, Flag } from "effect/cli";

import { CommandError } from "#src/errors.ts";
import * as GohoServer from "#src/goho-server.ts";

const itemKeys = ["name", "amount", "category"];

const invalidItem = (item: string, problem: string) =>
  new CommandError({
    type: "goho:cli:invalid-input",
    detail: `Invalid --item "${item}": ${problem}. Expected name=<text>,amount=<decimal>,category=<text>, with commas in values written as \\, and backslashes as \\\\.`,
  });

const splitItemFields = (item: string) => {
  const fields: Array<string> = [];
  let current = "";
  for (let index = 0; index < item.length; index += 1) {
    const character = item.charAt(index);
    const next = item.charAt(index + 1);
    if (character === "\\" && (next === "," || next === "\\")) {
      current += next;
      index += 1;
    } else if (character === ",") {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
};

// Strict on purpose: an unescaped comma in a name fails here instead of saving a truncated item.
const parseItem = Effect.fnUntraced(function* (item: string) {
  const entries = new Map<string, string>();
  for (const field of splitItemFields(item)) {
    const separator = field.indexOf("=");
    if (separator === -1) {
      return yield* invalidItem(item, `"${field}" is not a key=value pair`);
    }
    const key = field.slice(0, separator);
    if (!itemKeys.includes(key)) {
      return yield* invalidItem(item, `"${key}" is not a known key`);
    }
    if (entries.has(key)) {
      return yield* invalidItem(item, `"${key}" appears more than once`);
    }
    entries.set(key, field.slice(separator + 1));
  }
  const missing = itemKeys.filter((key) => !entries.has(key));
  if (missing.length > 0) {
    return yield* invalidItem(item, `missing ${missing.join(", ")}`);
  }
  return Object.fromEntries(entries);
});

/**
 * Saves one receipt from flags and prints it. Every call saves a new receipt, so
 * running it twice leaves two receipts.
 *
 * @category commands
 * @since 0.1.0
 */
export const createCommand = Command.make("create", {
  storeName: Flag.String("store-name").pipe(Flag.withDescription("Store or merchant name.")),
  receiptDate: Flag.String("receipt-date").pipe(
    Flag.withDescription("Purchase date in YYYY-MM-DD format."),
  ),
  subtotal: Flag.String("subtotal").pipe(Flag.withDescription("Amount before tax, as a decimal.")),
  tax: Flag.String("tax").pipe(Flag.withDescription("Tax amount, as a decimal.")),
  total: Flag.String("total").pipe(Flag.withDescription("Final total, as a decimal.")),
  currency: Flag.String("currency").pipe(
    Flag.withDescription("Three-letter uppercase currency code."),
  ),
  items: Flag.String("item").pipe(
    Flag.withDescription(
      "Line item as name=<text>,amount=<decimal>,category=<text>; repeat in receipt order. Write commas in values as \\,.",
    ),
    Flag.atLeast(1),
  ),
}).pipe(
  Command.withDescription("Save one new receipt with its line items."),
  Command.withHandler(({ items, ...fields }) =>
    Effect.gen(function* () {
      const parsedItems = yield* Effect.forEach(items, parseItem);
      const payload = yield* Schema.decodeUnknownEffect(CreateReceiptRequest)({
        ...fields,
        items: parsedItems,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new CommandError({
              type: "goho:cli:invalid-input",
              detail: `Receipt is not valid: ${cause.message}`,
            }),
        ),
      );
      const client = yield* GohoServer.Service;
      const response = yield* client.receipts.create({ payload });
      yield* Console.log(JSON.stringify(response.data, null, 2));
    }),
  ),
  Command.provide(GohoServer.layer),
);
