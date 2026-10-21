import { Schedule } from "effect";

/**
 * Shared SQL table used by every persisted queue in the server.
 *
 * @category models
 * @since 0.1.0
 */
export const tableName = "goho_queues";

/**
 * Number of processing attempts before an upload job reaches a terminal failure.
 *
 * @category constants
 * @since 0.1.0
 */
export const maxAttempts = 3;

/**
 * Delay before each retry of a failed upload job.
 *
 * @category constants
 * @since 0.1.0
 */
export const retrySchedule = Schedule.exponential("1 second");
