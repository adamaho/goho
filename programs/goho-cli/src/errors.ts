import { Schema } from "effect";

/**
 * Safe command-line failure with its diagnostic cause.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommandError extends Schema.TaggedError<CommandError>()("GohoCli.CommandError", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}
