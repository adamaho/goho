import {
  CalendarDate,
  Category,
  CategoryId,
  DecimalString,
  Receipt as ReceiptSchema,
  ReceiptId,
  ReceiptItemId,
  type CreateReceiptRequest,
  type PatchReceiptItemRequest,
  type PatchReceiptRequest,
  type Receipt,
  type ReceiptItem,
} from "@goho/goho-api/receipts";
import { Array, Context, Effect, Layer, Option, pipe, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

import * as CategoryRepository from "#src/categories/repository.ts";
import { FileId } from "#src/file-storage.ts";
import { ReceiptIdFromDatabase, ReceiptItemIdFromDatabase } from "#src/schema.ts";

/**
 * Expected failure while reading or saving a receipt.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.ReceiptRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Receipt persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  readonly delete: (
    receiptId: ReceiptId,
  ) => Effect.Effect<Option.Option<{ readonly fileId: FileId | null }>, PersistenceError>;
  readonly findById: (
    receiptId: ReceiptId,
  ) => Effect.Effect<Option.Option<Receipt>, PersistenceError>;
  readonly insert: (receipt: CreateReceiptRequest) => Effect.Effect<ReceiptId, PersistenceError>;
  readonly list: Effect.Effect<ReadonlyArray<Receipt>, PersistenceError>;
  /**
   * Saves only the supplied receipt fields and returns the complete saved receipt
   * from the same transaction; none when the receipt does not exist.
   */
  readonly update: (
    receiptId: ReceiptId,
    changes: PatchReceiptRequest,
  ) => Effect.Effect<Option.Option<Receipt>, PersistenceError>;
  /**
   * Saves only the supplied item fields and returns the saved item; none, without
   * creating a category, when the receipt has no item with that ID.
   */
  readonly updateItem: (
    receiptId: ReceiptId,
    itemId: ReceiptItemId,
    changes: PatchReceiptItemRequest,
  ) => Effect.Effect<Option.Option<ReceiptItem>, PersistenceError>;
}

/**
 * Receipt persistence; callers decide how failures affect their workflow.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/ReceiptRepository",
) {}

const IdRow = Schema.Struct({ id: ReceiptIdFromDatabase });

const ReceiptRow = Schema.Struct({
  id: ReceiptIdFromDatabase,
  store_name: Schema.String,
  receipt_date: CalendarDate,
  subtotal: DecimalString,
  tax: DecimalString,
  total: DecimalString,
  currency: Schema.String,
});

const ItemRow = Schema.Struct({
  id: ReceiptItemIdFromDatabase,
  position: Schema.Int,
  name: Schema.String,
  amount: DecimalString,
  category: Category,
});

const ReceiptListRow = Schema.Struct({
  ...ReceiptRow.fields,
  item_id: Schema.NullOr(ReceiptItemIdFromDatabase),
  item_position: Schema.NullOr(Schema.Int),
  item_name: Schema.NullOr(Schema.String),
  item_amount: Schema.NullOr(DecimalString),
  item_category: Schema.NullOr(Category),
});

const ItemInsertRow = Schema.Struct({
  receipt_id: ReceiptId,
  position: Schema.Int,
  name: Schema.String,
  amount: DecimalString,
  category_id: CategoryId,
});
const decodeReceiptList = Schema.decodeUnknownEffect(Schema.Array(ReceiptSchema));

type ReceiptCandidate = Omit<Receipt, "categories" | "items"> & {
  readonly items: Array<ReceiptItem>;
};

// The category `c` as its API object; text IDs keep their precision in JSON.
const categoryObject =
  "jsonb_build_object('id', c.id::text, 'name', c.name, 'icon', c.icon, 'color', c.color)";

const receiptCategories = <Items extends ReadonlyArray<ReceiptItem>>(items: Items) =>
  pipe(
    Array.map(items, (item) => item.category),
    Array.dedupeWith((self, that) => self.id === that.id),
  );

/**
 * Reads receipts and inserts each receipt with all its items. Each item's
 * category name resolves to a shared category in the same transaction, and a
 * receipt's categories are its items' distinct categories in item order.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const categories = yield* CategoryRepository.Service;

    const lockReceipt = SqlSchema.findOneOption({
      Request: ReceiptId,
      Result: IdRow,
      execute: (receiptId) => sql`SELECT id FROM receipts WHERE id = ${receiptId} FOR UPDATE`,
    });

    const deleteUpload = SqlSchema.findOneOption({
      Request: ReceiptId,
      Result: Schema.Struct({ file_id: FileId }),
      execute: (receiptId) => sql`
        DELETE FROM receipt_uploads WHERE receipt_id = ${receiptId} RETURNING file_id
      `,
    });

    const deleteReceiptRow = SqlSchema.void({
      Request: ReceiptId,
      execute: (receiptId) => sql`DELETE FROM receipts WHERE id = ${receiptId}`,
    });

    const deleteReceipt = Effect.fn("@goho/ReceiptRepository.deleteReceipt")(
      (receiptId: ReceiptId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Serialize deletes and retain the file ID until the caller's transaction commits.
            if (Option.isNone(yield* lockReceipt(receiptId))) return Option.none();
            const upload = yield* deleteUpload(receiptId);
            yield* deleteReceiptRow(receiptId);
            return Option.some({ fileId: Option.isSome(upload) ? upload.value.file_id : null });
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "delete", cause })),
    );

    const findReceiptRow = SqlSchema.findOneOption({
      Request: ReceiptId,
      Result: ReceiptRow,
      execute: (receiptId) => sql`
        SELECT id, store_name, receipt_date::text, subtotal::text, tax::text, total::text, currency
        FROM receipts WHERE id = ${receiptId}
      `,
    });

    const updateReceiptRow = SqlSchema.void({
      Request: Schema.Struct({
        receiptId: ReceiptId,
        // Encoding keeps only these editable columns, so no other field can reach the SET list.
        changes: Schema.Struct({
          storeName: Schema.optionalKey(Schema.String),
          receiptDate: Schema.optionalKey(CalendarDate),
        }).pipe(Schema.encodeKeys({ storeName: "store_name", receiptDate: "receipt_date" })),
      }),
      execute: ({ receiptId, changes }) => sql`
        UPDATE receipts SET ${sql.update(changes)} WHERE id = ${receiptId}
      `,
    });

    const lockItem = SqlSchema.findOneOption({
      Request: Schema.Struct({ receiptId: ReceiptId, itemId: ReceiptItemId }),
      Result: Schema.Struct({ id: ReceiptItemIdFromDatabase }),
      // Matching the parent too keeps another receipt's item out of reach.
      execute: ({ receiptId, itemId }) => sql`
        SELECT id FROM receipt_items WHERE id = ${itemId} AND receipt_id = ${receiptId} FOR UPDATE
      `,
    });

    const updateItemRow = SqlSchema.void({
      Request: Schema.Struct({
        itemId: ReceiptItemId,
        // Encoding keeps only these editable columns, so no other field can reach the SET list.
        changes: Schema.Struct({
          name: Schema.optionalKey(Schema.String),
          categoryId: Schema.optionalKey(CategoryId),
        }).pipe(Schema.encodeKeys({ categoryId: "category_id" })),
      }),
      execute: ({ itemId, changes }) => sql`
        UPDATE receipt_items SET ${sql.update(changes)} WHERE id = ${itemId}
      `,
    });

    const selectItems = sql.literal(`
      SELECT i.id, i.position, i.name, i.amount::text, ${categoryObject} AS category
      FROM receipt_items i JOIN categories c ON c.id = i.category_id
    `);

    const findItemRow = SqlSchema.findOneOption({
      Request: ReceiptItemId,
      Result: ItemRow,
      execute: (itemId) => sql`${selectItems} WHERE i.id = ${itemId}`,
    });

    const findItemRows = SqlSchema.findNonEmpty({
      Request: ReceiptId,
      Result: ItemRow,
      execute: (receiptId) => sql`
        ${selectItems} WHERE i.receipt_id = ${receiptId} ORDER BY i.position
      `,
    });

    const insertReceiptRow = SqlSchema.findOne({
      Request: Schema.Struct({
        storeName: Schema.String,
        receiptDate: CalendarDate,
        subtotal: DecimalString,
        tax: DecimalString,
        total: DecimalString,
        currency: ReceiptSchema.fields.currency,
      }),
      Result: IdRow,
      execute: (receipt) => sql`
        INSERT INTO receipts (
          store_name, receipt_date, subtotal, tax, total, currency
        ) VALUES (
          ${receipt.storeName}, ${receipt.receiptDate},
          ${receipt.subtotal}, ${receipt.tax}, ${receipt.total}, ${receipt.currency}
        ) RETURNING id
      `,
    });

    const insertItemRows = SqlSchema.void({
      Request: Schema.Array(ItemInsertRow),
      execute: (rows) => sql`INSERT INTO receipt_items ${sql.insert(rows)}`,
    });

    const selectListRows = SqlSchema.findAll({
      Request: Schema.Void,
      Result: ReceiptListRow,
      execute: () => sql`
        SELECT r.id, r.store_name, r.receipt_date::text,
          r.subtotal::text, r.tax::text, r.total::text, r.currency,
          i.id AS item_id, i.position AS item_position, i.name AS item_name,
          i.amount::text AS item_amount,
          CASE WHEN i.id IS NOT NULL THEN ${sql.literal(categoryObject)} END AS item_category
        FROM receipts r
        LEFT JOIN (receipt_items i JOIN categories c ON c.id = i.category_id)
          ON i.receipt_id = r.id
        ORDER BY r.receipt_date DESC, r.created_at DESC, r.id, i.position
      `,
    });

    const readReceipt = Effect.fnUntraced(function* (receiptId: ReceiptId) {
      const receipt = yield* findReceiptRow(receiptId);
      if (Option.isNone(receipt)) return Option.none();
      const items = yield* findItemRows(receiptId);
      return Option.some({
        id: receipt.value.id,
        storeName: receipt.value.store_name,
        receiptDate: receipt.value.receipt_date,
        subtotal: receipt.value.subtotal,
        tax: receipt.value.tax,
        total: receipt.value.total,
        currency: receipt.value.currency,
        categories: receiptCategories(items),
        items,
      } satisfies Receipt);
    });

    const findById = Effect.fn("@goho/ReceiptRepository.findById")(
      readReceipt,
      Effect.mapError((cause) => new PersistenceError({ operation: "findById", cause })),
    );
    // Callers may compose this into a larger transaction, where it becomes a savepoint.

    const insert = Effect.fn("@goho/ReceiptRepository.insert")(
      function* (receipt: CreateReceiptRequest) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const { id } = yield* insertReceiptRow(receipt);
            // Items resolve one at a time, so each distinct incoming name is looked up
            // once per insert. Case or space variants still resolve through the database.
            const categoryIds = new Map<string, CategoryId>();
            const rows = yield* Effect.forEach(receipt.items, (item, position) =>
              Effect.gen(function* () {
                let categoryId = categoryIds.get(item.category);
                if (categoryId === undefined) {
                  categoryId = (yield* categories.findOrCreate(item.category)).id;
                  categoryIds.set(item.category, categoryId);
                }
                return {
                  receipt_id: id,
                  position,
                  name: item.name,
                  amount: item.amount,
                  category_id: categoryId,
                };
              }),
            );
            yield* insertItemRows(rows);
            return id;
          }),
        );
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "insert", cause })),
    );

    const list = Effect.gen(function* () {
      const rows = yield* selectListRows(undefined);
      const receipts = new Map<ReceiptId, ReceiptCandidate>();
      for (const row of rows) {
        let receipt = receipts.get(row.id);
        if (receipt === undefined) {
          receipt = {
            id: row.id,
            storeName: row.store_name,
            receiptDate: row.receipt_date,
            subtotal: row.subtotal,
            tax: row.tax,
            total: row.total,
            currency: row.currency,
            items: [],
          };
          receipts.set(row.id, receipt);
        }
        if (
          row.item_id !== null &&
          row.item_position !== null &&
          row.item_name !== null &&
          row.item_amount !== null &&
          row.item_category !== null
        ) {
          receipt.items.push({
            id: row.item_id,
            position: row.item_position,
            name: row.item_name,
            amount: row.item_amount,
            category: row.item_category,
          });
        }
      }
      return yield* decodeReceiptList(
        Array.map([...receipts.values()], (receipt) => ({
          ...receipt,
          categories: receiptCategories(receipt.items),
        })),
      );
    }).pipe(
      Effect.mapError((cause) => new PersistenceError({ operation: "list", cause })),
      Effect.withSpan("@goho/ReceiptRepository.list"),
    );

    // Only whitelisted editable columns are written; omitted fields keep their values.
    const update = Effect.fn("@goho/ReceiptRepository.update")(
      (receiptId: ReceiptId, changes: PatchReceiptRequest) =>
        sql.withTransaction(
          Effect.gen(function* () {
            if (changes.storeName !== undefined || changes.receiptDate !== undefined) {
              yield* updateReceiptRow({ receiptId, changes });
            }
            return yield* readReceipt(receiptId);
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "update", cause })),
    );

    const updateItem = Effect.fn("@goho/ReceiptRepository.updateItem")(
      (receiptId: ReceiptId, itemId: ReceiptItemId, changes: PatchReceiptItemRequest) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Lock the receipt before its item, matching deletion's lock order; the
            // item trigger then touches the receipt this transaction already holds.
            // Finding both first keeps a missing item from leaving a new category behind.
            if (Option.isNone(yield* lockReceipt(receiptId))) return Option.none();
            if (Option.isNone(yield* lockItem({ receiptId, itemId }))) return Option.none();
            const { category, ...fields } = changes;
            const categoryChange =
              category === undefined
                ? {}
                : { categoryId: (yield* categories.findOrCreate(category)).id };
            yield* updateItemRow({ itemId, changes: { ...fields, ...categoryChange } });
            return yield* findItemRow(itemId);
          }),
        ),
      Effect.mapError((cause) => new PersistenceError({ operation: "updateItem", cause })),
    );

    return Service.of({ delete: deleteReceipt, findById, insert, list, update, updateItem });
  }),
);
