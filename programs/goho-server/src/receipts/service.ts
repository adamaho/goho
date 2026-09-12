import type { Ai, GoogleDrive, GoogleSheets } from "@goho/core";
import type {
  CreateReceiptRequest,
  IdempotencyKey,
  ProcessRequest,
  Receipt,
  ReceiptProcessingResult,
} from "@goho/goho-server-client/receipts";
import { Context, Effect, Layer, Ref } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";

import * as Workflow from "./process.ts";
import * as ReceiptRepository from "./repository.ts";

/**
 * Runs one receipt batch at a time.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<
  Service,
  {
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
 * Provides the existing workflow with an in-process batch lock.
 *
 * @category models
 * @since 0.1.0
 */
export const make = Effect.fn("@goho/ReceiptService.make")(function* (
  run: (
    request: ProcessRequest,
  ) => Effect.Effect<ReadonlyArray<Workflow.ReceiptProcessingResult>, unknown>,
) {
  const busy = yield* Ref.make(false);
  const process = Effect.fn("@goho/ReceiptService.process")(function* (request: ProcessRequest) {
    const acquired = yield* Ref.modify(busy, (current) => [!current, true]);
    if (!acquired) return yield* new HttpApiError.Conflict();
    return yield* run(request).pipe(
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
  return { process } as const;
});

/**
 * Maps receipt persistence outcomes onto the public HTTP error contract.
 *
 * @category models
 * @since 0.1.0
 */
export const makeCreate = (repository: Pick<ReceiptRepository.Interface, "create">) =>
  Effect.fn("@goho/ReceiptService.create")(
    (idempotencyKey: IdempotencyKey, receipt: CreateReceiptRequest) =>
      repository.create(idempotencyKey, receipt).pipe(
        Effect.catchTag(
          "GohoServer.ReceiptRepository.IdempotencyConflict",
          () => new HttpApiError.Conflict(),
        ),
        Effect.catchTag("GohoServer.ReceiptRepository.PersistenceError", (error) =>
          Effect.logError("Receipt creation failed", error).pipe(
            Effect.andThen(Effect.fail(new HttpApiError.InternalServerError())),
          ),
        ),
      ),
  );

/**
 * Provides Google-backed receipt processing.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<
  Service,
  never,
  Ai.Service | GoogleDrive.Service | GoogleSheets.Service | ReceiptRepository.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repository = yield* ReceiptRepository.Service;
    const services = yield* Effect.context<
      Ai.Service | GoogleDrive.Service | GoogleSheets.Service | ReceiptRepository.Service
    >();
    const batch = yield* make((request) =>
      Workflow.process(request.rootFolderId, request.spreadsheetId, request.concurrency).pipe(
        Effect.provide(services),
      ),
    );
    const create = makeCreate(repository);
    return Service.of({ ...batch, create });
  }),
);
