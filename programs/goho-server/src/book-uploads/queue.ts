import { BookUploadId } from "@goho/goho-api/book-uploads";
import { Context, Effect, Layer, Schema } from "effect";
import { PersistedQueue } from "effect/persistence";

import * as QueueConstants from "#src/queues/constants.ts";
import * as QueueStore from "#src/queues/store.ts";

/**
 * Work required to process one stored cover upload.
 *
 * @category models
 * @since 0.1.0
 */
export const BookUploadJob = Schema.Struct({ uploadId: BookUploadId });

/**
 * Work required to process one stored cover upload.
 *
 * @category models
 * @since 0.1.0
 */
export interface BookUploadJob extends Schema.Schema.Type<typeof BookUploadJob> {}

/**
 * Persisted queue name shared by the queue and upload recovery.
 *
 * @category constants
 * @since 0.1.0
 */
export const name = "book-uploads";

/**
 * Durable queue of cover uploads waiting to be processed.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service>()("@goho/goho-server/BookUploadQueue", {
  make: Effect.gen(function* () {
    const queue = yield* PersistedQueue.make({
      name,
      schema: BookUploadJob,
      maxAttempts: QueueConstants.maxAttempts,
      retrySchedule: QueueConstants.retrySchedule,
    });
    const offer = Effect.fn("@goho/BookUploadQueue.offer")(function* (job: BookUploadJob) {
      yield* queue.offer(job, { id: job.uploadId });
      return job.uploadId;
    });
    return { offer, take: queue.take };
  }),
}) {}

/**
 * Provides the cover upload queue on the persisted queue store shared with
 * receipt uploads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, Service.make).pipe(Layer.provide(QueueStore.layer));
