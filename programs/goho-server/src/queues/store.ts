import { Layer } from "effect";
import { PersistedQueue } from "effect/persistence";

import * as QueueConstants from "./constants.ts";

const StoreLive = PersistedQueue.layerStoreSql({ tableName: QueueConstants.tableName });

/**
 * Provides the persisted queue factory over the shared SQL queue table, with one
 * cleanup fiber that removes every queue's completed jobs after 30 days. Each
 * queue layer provides this value, so one application build creates a single
 * store and cleanup fiber for all of them.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.merge(PersistedQueue.layer, PersistedQueue.layerCleanup()).pipe(
  Layer.provide(StoreLive),
);
