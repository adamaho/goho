import { RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { Context, Effect, Layer, Schema } from "effect";
import { PersistedQueue } from "effect/persistence";

import * as QueueConstants from "#src/queues/constants.ts";
import * as QueueStore from "#src/queues/store.ts";

/**
 * Work required to import one recipe page.
 *
 * @category models
 * @since 0.1.0
 */
export const RecipeUploadJob = Schema.Struct({ uploadId: RecipeUploadId });

/**
 * Work required to import one recipe page.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecipeUploadJob extends Schema.Schema.Type<typeof RecipeUploadJob> {}

/**
 * Persisted queue name shared by the queue and upload recovery.
 *
 * @category constants
 * @since 0.1.0
 */
export const name = "recipe-uploads";

/**
 * Durable queue of recipe imports waiting to be processed.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service>()("@goho/goho-server/RecipeUploadQueue", {
  make: Effect.gen(function* () {
    const queue = yield* PersistedQueue.make({
      name,
      schema: RecipeUploadJob,
      maxAttempts: QueueConstants.maxAttempts,
      retrySchedule: QueueConstants.retrySchedule,
    });
    const offer = Effect.fn("@goho/RecipeUploadQueue.offer")(function* (job: RecipeUploadJob) {
      yield* queue.offer(job, { id: job.uploadId });
      return job.uploadId;
    });
    return { offer, take: queue.take };
  }),
}) {}

/**
 * Provides the recipe import queue on the persisted queue store shared with
 * receipt and book uploads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, Service.make).pipe(Layer.provide(QueueStore.layer));
