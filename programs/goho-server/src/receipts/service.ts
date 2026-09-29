import {
  CreateReceiptRequest as CreateReceiptRequestSchema,
  DecimalString,
  IdempotencyKey as IdempotencyKeySchema,
  type CreateReceiptRequest,
  type IdempotencyKey,
  type Receipt,
  type ReceiptId,
} from "@goho/goho-api/receipts";
import { Array, BigDecimal, Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";

import * as ReceiptRepository from "./repository.ts";

const normalizeDecimal = (value: DecimalString) =>
  DecimalString.make(BigDecimal.format(BigDecimal.normalize(BigDecimal.fromStringUnsafe(value))));

const normalizeReceipt = (receipt: CreateReceiptRequest) => ({
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
      idempotencyKey: IdempotencyKey,
      receipt: CreateReceiptRequest,
    ) => Effect.Effect<Receipt, HttpApiError.Conflict | HttpApiError.InternalServerError>;
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
    const sql = yield* SqlClient.SqlClient;
    const crypto = yield* Crypto.Crypto;
    const create = Effect.fn("@goho/ReceiptService.create")(function* (
      idempotencyKey: IdempotencyKey,
      input: CreateReceiptRequest,
    ) {
      const result = yield* Effect.gen(function* () {
        const key = yield* Schema.decodeEffect(IdempotencyKeySchema)(idempotencyKey).pipe(
          Effect.mapError(
            (cause) => new ReceiptRepository.PersistenceError({ operation: "create", cause }),
          ),
        );
        const receipt = normalizeReceipt(
          yield* Schema.decodeEffect(CreateReceiptRequestSchema)(input).pipe(
            Effect.mapError(
              (cause) => new ReceiptRepository.PersistenceError({ operation: "create", cause }),
            ),
          ),
        );
        const fingerprint = yield* crypto.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(receipt)),
        );
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const inserted = yield* repository.insertManual(key, fingerprint, receipt);
            let receiptId: ReceiptId;
            if (Option.isSome(inserted)) {
              receiptId = inserted.value;
              yield* repository.insertItems(
                receiptId,
                Array.map(receipt.items, (item, position) => ({ ...item, position })),
              );
            } else {
              const existing = yield* repository.findByIdempotencyKey(key, fingerprint);
              if (Option.isNone(existing)) return yield* new HttpApiError.Conflict();
              receiptId = existing.value;
            }
            const saved = yield* repository.findById(receiptId);
            if (Option.isNone(saved)) {
              return yield* new ReceiptRepository.PersistenceError({
                operation: "create",
                cause: "Inserted receipt could not be found",
              });
            }
            return saved.value;
          }),
        );
      }).pipe(
        Effect.catchTags({
          "GohoServer.ReceiptRepository.PersistenceError": (error) =>
            Effect.logError("Receipt creation failed", error).pipe(
              Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
            ),
          SqlError: (error) =>
            Effect.logError("Receipt transaction failed", error).pipe(
              Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
            ),
          PlatformError: (error) =>
            Effect.logError("Receipt fingerprint failed", error).pipe(
              Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
            ),
        }),
      );
      return result;
    });
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
