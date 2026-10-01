import {
  type CreateReceiptRequest,
  DecimalString,
  type Receipt,
  type ReceiptId,
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
 * Retrieves, creates, and deletes receipts.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<
  Service,
  {
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

    return Service.of({ create, delete: deleteReceipt, get, list });
  }),
);
