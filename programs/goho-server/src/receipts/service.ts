import {
  type CreateReceiptRequest,
  DecimalString,
  type Receipt,
  type ReceiptId,
} from "@goho/goho-api/receipts";
import { Array, BigDecimal, Context, Effect, Layer, Option } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";

import * as ReceiptRepository from "./repository.ts";

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
 * Retrieves and creates receipts.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<
  Service,
  {
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
 * Provides receipt retrieval and creation.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* ReceiptRepository.Service;

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

    return Service.of({ create, get, list });
  }),
);
