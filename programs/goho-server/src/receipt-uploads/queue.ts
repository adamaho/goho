import { Context, Effect, Layer, Schedule, Schema } from "effect";
import { PersistedQueue } from "effect/unstable/persistence";

import { ReceiptUploadId } from "./model.ts";

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
 * Durable queue of receipt uploads waiting to be processed.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service>()("@goho/goho-server/ReceiptUploadQueue", {
  make: Effect.gen(function* () {
    const queue = yield* PersistedQueue.make({
      name: "receipt-uploads",
      schema: ReceiptUploadJob,
      maxAttempts: 3,
      retrySchedule: Schedule.exponential("1 second"),
    });
    const offer = Effect.fn("@goho/ReceiptUploadQueue.offer")(function* (job: ReceiptUploadJob) {
      yield* queue.offer(job, { id: job.uploadId });
      return job.uploadId;
    });
    return { offer, take: queue.take };
  }),
}) {}

const StoreLive = PersistedQueue.layerStoreSql();
const QueueLive = Layer.effect(Service, Service.make).pipe(
  Layer.provide(PersistedQueue.layer),
  Layer.provide(StoreLive),
);
const CleanupLive = PersistedQueue.layerCleanup().pipe(Layer.provide(StoreLive));

/**
 * Provides the receipt upload queue through Effect's SQL-backed persisted queue.
 * Completed jobs are retained for 30 days before the cleanup fiber removes them.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.merge(QueueLive, CleanupLive);
