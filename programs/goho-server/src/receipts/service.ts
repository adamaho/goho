import type {
  CreateReceiptRequest,
  IdempotencyKey,
  Receipt,
  ReceiptId,
} from "@goho/goho-api/receipts";
import { Context, Effect, Layer, Option } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";

import * as ReceiptRepository from "./repository.ts";

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
    const create = Effect.fn("@goho/ReceiptService.create")(
      (idempotencyKey: IdempotencyKey, receipt: CreateReceiptRequest) =>
        repository.create(idempotencyKey, receipt).pipe(
          Effect.catchTags({
            "GohoServer.ReceiptRepository.IdempotencyConflict": () =>
              Effect.fail(new HttpApiError.Conflict()),
            "GohoServer.ReceiptRepository.PersistenceError": (error) =>
              Effect.logError("Receipt creation failed", error).pipe(
                Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
              ),
          }),
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
