import { Ai } from "@goho/core";
import type { Receipt, ReceiptId, ReceiptItemId } from "@goho/goho-api/receipts";
import { Array, Effect, Schema } from "effect";

import * as CategoryRepository from "#src/categories/repository.ts";
import * as Transaction from "#src/database/transaction.ts";

import * as ReceiptRepository from "./repository.ts";

/**
 * One item whose category the model assigned differently from its current one.
 *
 * @category models
 * @since 0.1.0
 */
export interface CategoryChange {
  readonly itemId: ReceiptItemId;
  readonly itemName: string;
  readonly from: string;
  readonly to: string;
}

/**
 * Result for one receipt: its category changes, or why nothing was saved for it.
 *
 * @category models
 * @since 0.1.0
 */
export type ReceiptOutcome =
  | {
      readonly receiptId: ReceiptId;
      readonly storeName: string;
      readonly status: "classified";
      readonly changes: ReadonlyArray<CategoryChange>;
    }
  | {
      readonly receiptId: ReceiptId;
      readonly storeName: string;
      readonly status: "failed";
      readonly error: string;
    };

/**
 * The model's assignments do not cover each receipt item exactly once.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidAssignments extends Schema.TaggedError<InvalidAssignments>()(
  "GohoServer.Reclassification.InvalidAssignments",
  { message: Schema.String },
) {}

/**
 * Item categories cannot be assigned because the catalog is empty.
 *
 * @category errors
 * @since 0.1.0
 */
export class EmptyCatalog extends Schema.TaggedError<EmptyCatalog>()(
  "GohoServer.Reclassification.EmptyCatalog",
  {},
) {}

const systemPrompt = `Assign each item on a saved receipt exactly one category from the allowed categories.
- Choose the closest fit for what the item is, using its name, amount, and the merchant as context.
- Return every item ID exactly once, each with one allowed category.`;

const classify = Effect.fnUntraced(function* (
  receipt: Receipt,
  categories: Array.NonEmptyReadonlyArray<string>,
) {
  const ai = yield* Ai.Service;
  const itemIds = Array.map(receipt.items, (item) => item.id);
  const { items } = yield* ai.generateObject({
    objectName: "item_categories",
    schema: Schema.Struct({
      items: Schema.Array(
        Schema.Struct({ id: Schema.Literals(itemIds), category: Schema.Literals(categories) }),
      ),
    }),
    prompt: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          merchant: receipt.storeName,
          receiptDate: receipt.receiptDate,
          items: receipt.items.map(({ id, name, amount }) => ({ id, name, amount })),
          allowedCategories: categories,
        }),
      },
    ],
  });
  // The schema keeps IDs on this receipt; complete coverage needs one assignment per item.
  const assigned = new Map(items.map((item) => [item.id, item.category]));
  if (assigned.size !== items.length || assigned.size !== itemIds.length) {
    return yield* new InvalidAssignments({
      message: `Expected one assignment for each of ${itemIds.length} items; received ${items.length} for ${assigned.size} items`,
    });
  }
  return receipt.items.flatMap((item): Array<CategoryChange> => {
    const to = assigned.get(item.id);
    return to === undefined || to === item.category.name
      ? []
      : [{ itemId: item.id, itemName: item.name, from: item.category.name, to }];
  });
});

/**
 * Reclassifies every saved item into an existing category using its name and
 * receipt context. A preview only reports proposed changes. With `apply`, each
 * receipt's changes save atomically through normal item updates and history;
 * names, amounts, and extraction payloads stay untouched. A receipt whose model
 * output is invalid, or whose save fails, saves nothing and is reported as failed
 * while the run continues. Model calls happen outside database transactions.
 *
 * @category workflows
 * @since 0.1.0
 */
export const run = Effect.fn("@goho/Reclassification.run")(function* (options: {
  readonly apply: boolean;
}) {
  const categoryNames = yield* CategoryRepository.Service.pipe(
    Effect.flatMap((categories) => categories.listNames),
  );
  if (!Array.isReadonlyArrayNonEmpty(categoryNames)) return yield* new EmptyCatalog();
  const receipts = yield* ReceiptRepository.Service;
  const transaction = yield* Transaction.Service;

  return yield* Effect.forEach(yield* receipts.list, (receipt) =>
    Effect.gen(function* () {
      const changes = yield* classify(receipt, categoryNames);
      if (options.apply && changes.length > 0) {
        yield* transaction.run(
          Effect.forEach(changes, (change) =>
            receipts
              .updateItem(receipt.id, change.itemId, { category: change.to })
              .pipe(Effect.flatMap(Effect.fromOption)),
          ),
        );
      }
      return {
        receiptId: receipt.id,
        storeName: receipt.storeName,
        status: "classified",
        changes,
      } satisfies ReceiptOutcome;
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          receiptId: receipt.id,
          storeName: receipt.storeName,
          status: "failed",
          error: `${error._tag}: ${error.message}`,
        } satisfies ReceiptOutcome),
      ),
    ),
  );
});
