import { Ai, GoogleDrive, GoogleSheets } from "@goho/core";
import type {
  CreateReceiptRequest,
  IdempotencyKey,
  ProcessRequest,
  Receipt,
  ReceiptId,
  ReceiptProcessingResult,
} from "@goho/goho-server-client/receipts";
import { Context, Effect, Layer, Option, Ref } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";

import * as Workflow from "./process.ts";
import * as ReceiptRepository from "./repository.ts";

/**
 * Retrieves and creates receipts and runs one receipt processing batch at a time.
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
    readonly list: () => Effect.Effect<ReadonlyArray<Receipt>, HttpApiError.InternalServerError>;
    readonly create: (
      idempotencyKey: IdempotencyKey,
      receipt: CreateReceiptRequest,
    ) => Effect.Effect<Receipt, HttpApiError.Conflict | HttpApiError.InternalServerError>;
    readonly process: (
      request: ProcessRequest,
    ) => Effect.Effect<
      ReadonlyArray<ReceiptProcessingResult>,
      HttpApiError.Conflict | HttpApiError.InternalServerError
    >;
  }
>()("@goho/goho-server/Receipts") {}

/**
 * Provides receipt retrieval, creation, and Google-backed processing with an in-process batch lock.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* ReceiptRepository.Service;
    const ai = yield* Ai.Service;
    const googleDrive = yield* GoogleDrive.Service;
    const googleSheets = yield* GoogleSheets.Service;
    const workflowServices = Context.make(Ai.Service, ai).pipe(
      Context.add(GoogleDrive.Service, googleDrive),
      Context.add(GoogleSheets.Service, googleSheets),
      Context.add(ReceiptRepository.Service, repository),
    );
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
    const list = Effect.fn("@goho/ReceiptService.list")(() =>
      repository
        .list()
        .pipe(
          Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", (error) =>
            Effect.logError("Receipt listing failed", error).pipe(
              Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
            ),
          ),
        ),
    );
    const busy = yield* Ref.make(false);
    const process = Effect.fn("@goho/ReceiptService.process")(function* (request: ProcessRequest) {
      const acquired = yield* Ref.modify(busy, (current) => [!current, true]);
      if (!acquired) return yield* new HttpApiError.Conflict();
      return yield* Workflow.process(
        request.rootFolderId,
        request.spreadsheetId,
        request.concurrency,
      ).pipe(
        Effect.provide(workflowServices),
        Effect.flatMap((results) =>
          Effect.forEach(results, (result): Effect.Effect<ReceiptProcessingResult> => {
            switch (result._tag) {
              case "Failed":
                return Effect.logError("Receipt failed", result).pipe(
                  Effect.as({
                    _tag: result._tag,
                    fileId: result.fileId,
                    fileName: result.fileName,
                    stage: result.stage,
                    disposition: result.disposition,
                  }),
                );
              case "Stranded":
                return Effect.logError("Receipt stranded", result).pipe(
                  Effect.as({
                    _tag: result._tag,
                    fileId: result.fileId,
                    fileName: result.fileName,
                    stage: result.stage,
                  }),
                );
              default:
                return Effect.succeed(result);
            }
          }),
        ),
        Effect.catchCause((cause) =>
          Effect.logError("Receipt batch failed", cause).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
        ),
        Effect.ensuring(Ref.set(busy, false)),
      );
    }, Effect.uninterruptible);
    // Finish an accepted batch before releasing its lock, even if its HTTP client disconnects.
    return Service.of({ create, get, list, process });
  }),
);
