import { ReceiptUploadId } from "@goho/goho-api/receipt-uploads";
import { Context, Effect, Layer, Schema } from "effect";
import { PersistedQueue } from "effect/persistence";

import * as QueueConstants from "#src/queues/constants.ts";
import * as QueueStore from "#src/queues/store.ts";

/**
 * Work required to process one stored receipt upload.
 *
 * @category models
 * @since 0.1.0
 */
export const ReceiptUploadJob = Schema.Struct({ uploadId: ReceiptUploadId });

/**
 * Work required to process one stored receipt upload.
 *
 * @category models
 * @since 0.1.0
 */
export interface ReceiptUploadJob extends Schema.Schema.Type<typeof ReceiptUploadJob> {}

/**
 * Persisted queue name shared by the queue and upload recovery.
 *
 * @category constants
 * @since 0.1.0
 */
export const name = "receipt-uploads";

/**
 * Number of processing attempts before an upload reaches a terminal failure.
 *
 * @category constants
 * @since 0.1.0
 */
export const maxAttempts = QueueConstants.maxAttempts;

/**
 * Durable queue of receipt uploads waiting to be processed.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service>()("@goho/goho-server/ReceiptUploadQueue", {
  make: Effect.gen(function* () {
    const queue = yield* PersistedQueue.make({
      name,
      schema: ReceiptUploadJob,
      maxAttempts,
      retrySchedule: QueueConstants.retrySchedule,
    });
    const offer = Effect.fn("@goho/ReceiptUploadQueue.offer")(function* (job: ReceiptUploadJob) {
      yield* queue.offer(job, { id: job.uploadId });
      return job.uploadId;
    });
    return { offer, take: queue.take };
  }),
}) {}

/**
 * Provides the receipt upload queue through Effect's SQL-backed persisted queue.
 * Completed jobs are retained for 30 days before the shared cleanup fiber removes them.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, Service.make).pipe(Layer.provide(QueueStore.layer));
