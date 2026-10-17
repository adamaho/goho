import {
  type CreateReceiptRequest,
  DecimalString,
  type PatchReceiptItemRequest,
  type PatchReceiptRequest,
  type Receipt,
  type ReceiptId,
  type ReceiptItem,
  type ReceiptItemId,
} from "@goho/goho-api/receipts";
import { Array, BigDecimal, Context, Effect, Layer, Option } from "effect";
import { HttpApiError } from "effect/http-api";

import * as Transaction from "#src/database/transaction.ts";
import * as FileStorage from "#src/file-storage.ts";

import * as ReceiptRepository from "./repository.ts";

const deletionFailed = (error: unknown) =>
  Effect.logError("Receipt deletion failed", error).pipe(
    Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
  );

const correctionFailed = (error: unknown) =>
  Effect.logError("Receipt correction failed", error).pipe(
    Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
  );

const requireSaved = <A>(saved: Option.Option<A>) =>
  Effect.fromOption(saved).pipe(Effect.mapError(() => new HttpApiError.NotFound()));

const normalizeDecimal = (value: DecimalString) =>
  DecimalString.make(BigDecimal.format(BigDecimal.normalize(BigDecimal.fromStringUnsafe(value))));

const normalizeReceipt = (receipt: CreateReceiptRequest): CreateReceiptRequest => ({
  storeName: receipt.storeName,
  receiptDate: receipt.receiptDate,
  category: receipt.category,
  subtotal: normalizeDecimal(receipt.subtotal),
  tax: normalizeDecimal(receipt.tax),
  total: normalizeDecimal(receipt.total),
  currency: receipt.currency,
  items: Array.map(receipt.items, (item) => ({
    name: item.name,
    amount: normalizeDecimal(item.amount),
  })),
});

/**
 * Retrieves, creates, corrects, and deletes receipts.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<
  Service,
  {
    /** Saves the supplied receipt fields; fails with NotFound for a missing receipt. */
    readonly patch: (
      receiptId: ReceiptId,
      changes: PatchReceiptRequest,
    ) => Effect.Effect<Receipt, HttpApiError.NotFound | HttpApiError.InternalServerError>;
    /**
     * Renames an existing item and returns only that item; fails with NotFound
     * when the receipt has no item with that ID.
     */
    readonly patchItem: (
      receiptId: ReceiptId,
      itemId: ReceiptItemId,
      changes: PatchReceiptItemRequest,
    ) => Effect.Effect<ReceiptItem, HttpApiError.NotFound | HttpApiError.InternalServerError>;
    readonly delete: (
      receiptId: ReceiptId,
    ) => Effect.Effect<void, HttpApiError.NotFound | HttpApiError.InternalServerError>;
    readonly get: (
      receiptId: ReceiptId,
    ) => Effect.Effect<Receipt, HttpApiError.NotFound | HttpApiError.InternalServerError>;
    readonly list: Effect.Effect<ReadonlyArray<Receipt>, HttpApiError.InternalServerError>;
    readonly create: (
      receipt: CreateReceiptRequest,
    ) => Effect.Effect<Receipt, HttpApiError.InternalServerError>;
  }
>()("@goho/goho-server/Receipts") {}

/**
 * Provides receipt retrieval, creation, and deletion.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* ReceiptRepository.Service;
    const storage = yield* FileStorage.Service;
    const transaction = yield* Transaction.Service;

    const deleteReceipt = Effect.fn("@goho/ReceiptService.deleteReceipt")(
      (receiptId: ReceiptId) =>
        transaction.run(
          Effect.gen(function* () {
            const deleted = yield* repository.delete(receiptId);
            if (Option.isNone(deleted)) return yield* new HttpApiError.NotFound();
            if (deleted.value.fileId !== null) yield* storage.delete(deleted.value.fileId);
          }),
        ),
      Effect.catchTags({
        "GohoServer.ReceiptRepository.PersistenceError": deletionFailed,
        "GohoServer.FileStorage.StorageError": deletionFailed,
        "GohoServer.Database.TransactionError": deletionFailed,
      }),
    );

    const create = Effect.fn("@goho/ReceiptService.create")(
      function* (receipt: CreateReceiptRequest) {
        const receiptId = yield* repository.insert(normalizeReceipt(receipt));
        const saved = yield* repository.findById(receiptId);
        if (Option.isNone(saved)) {
          return yield* new ReceiptRepository.PersistenceError({
            operation: "create",
            cause: "Inserted receipt could not be found",
          });
        }
        return saved.value;
      },
      Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", (error) =>
        Effect.logError("Receipt creation failed", error).pipe(
          Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
        ),
      ),
    );

    const get = Effect.fn("@goho/ReceiptService.get")((receiptId: ReceiptId) =>
      repository.findById(receiptId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new HttpApiError.NotFound()),
            onSome: Effect.succeed,
          }),
        ),
        Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", (error) =>
          Effect.logError("Receipt retrieval failed", error).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
        ),
      ),
    );

    const list = repository.list.pipe(
      Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", (error) =>
        Effect.logError("Receipt listing failed", error).pipe(
          Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
        ),
      ),
      Effect.withSpan("@goho/ReceiptService.list"),
    );

    const patch = Effect.fn("@goho/ReceiptService.patch")(
      (receiptId: ReceiptId, changes: PatchReceiptRequest) =>
        repository.update(receiptId, changes).pipe(Effect.flatMap(requireSaved)),
      Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", correctionFailed),
    );

    const patchItem = Effect.fn("@goho/ReceiptService.patchItem")(
      (receiptId: ReceiptId, itemId: ReceiptItemId, changes: PatchReceiptItemRequest) =>
        repository.updateItem(receiptId, itemId, changes).pipe(Effect.flatMap(requireSaved)),
      Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", correctionFailed),
    );

    return Service.of({ create, delete: deleteReceipt, get, list, patch, patchItem });
  }),
);
