import { Cause, Effect, Option, Schema } from "effect";
import { CliError } from "effect/cli";
import { HttpClientError, HttpServerRespondable, ProblemDetails } from "effect/http";

/**
 * Problem types for failures the CLI detects itself. Server problems keep the
 * type the server sent.
 *
 * @category models
 * @since 0.1.0
 */
export const ProblemType = Schema.Literals([
  "goho:cli:invalid-input",
  "goho:cli:configuration-error",
  "goho:cli:connection-failed",
  "goho:cli:file-error",
  "goho:cli:unexpected-response",
  "goho:cli:unexpected-failure",
]);

/**
 * Decoded CLI problem type.
 *
 * @category models
 * @since 0.1.0
 */
export type ProblemType = typeof ProblemType.Type;

const titles = {
  "goho:cli:invalid-input": "Invalid command input",
  "goho:cli:configuration-error": "Invalid CLI configuration",
  "goho:cli:connection-failed": "Could not reach the Goho server",
  "goho:cli:file-error": "Local file error",
  "goho:cli:unexpected-response": "Unexpected server response",
  "goho:cli:unexpected-failure": "Unexpected failure",
} satisfies Record<ProblemType, string>;

/**
 * Failure the CLI detects itself. `detail` is public and printed as written.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommandError extends Schema.TaggedError<CommandError>()("GohoCli.CommandError", {
  type: ProblemType,
  detail: Schema.optionalKey(Schema.String),
}) {}

const localProblem = (type: ProblemType, detail?: string): ProblemDetails.ProblemDetails =>
  detail === undefined ? { type, title: titles[type] } : { type, title: titles[type], detail };

const connectionFailed = localProblem(
  "goho:cli:connection-failed",
  "Check that it is running and that GOHO_SERVER_URL is correct.",
);

const unexpectedResponse = localProblem(
  "goho:cli:unexpected-response",
  "The server sent a response the CLI could not read. Check that GOHO_SERVER_URL points to a Goho server.",
);

const unexpectedFailure = localProblem(
  "goho:cli:unexpected-failure",
  "The command failed unexpectedly. Try again.",
);

const decodeProblem = Schema.decodeUnknownEffect(Schema.fromJsonString(ProblemDetails.Schema));

// A decoded server problem renders through its own schema, so the output holds
// exactly its declared public members and extensions.
const encodeServerProblem = (problem: HttpServerRespondable.Respondable) =>
  HttpServerRespondable.toResponse(problem).pipe(
    Effect.flatMap((response) =>
      response.body._tag === "Uint8Array"
        ? decodeProblem(new TextDecoder().decode(response.body.body))
        : Effect.succeed(unexpectedFailure),
    ),
    Effect.orElseSucceed(() => unexpectedFailure),
    Effect.catchDefect(() => Effect.succeed(unexpectedFailure)),
  );

/**
 * Problem printed for a failed CLI run, or `undefined` when the run should end
 * as Effect reports it: interruption, or implicit help for a command group.
 * Causes, stacks and undeclared response bodies are never printed.
 *
 * @category mapping
 * @since 0.1.0
 */
export const getProblem = (
  cause: Cause.Cause<unknown>,
): Effect.Effect<ProblemDetails.ProblemDetails | undefined> => {
  if (Cause.hasInterruptsOnly(cause)) return Effect.undefined;
  const error = Option.getOrUndefined(Cause.findErrorOption(cause));
  if (error instanceof CommandError) return Effect.succeed(localProblem(error.type, error.detail));
  if (CliError.isCliError(error) && error._tag === "ShowHelp") {
    if (error.errors.length === 0) return Effect.undefined;
    const detail = error.errors.map((parseError) => parseError.message).join("\n");
    return Effect.succeed(localProblem("goho:cli:invalid-input", detail));
  }
  if (HttpClientError.isHttpClientError(error)) {
    switch (error.reason._tag) {
      case "TransportError":
        return Effect.succeed(connectionFailed);
      case "StatusCodeError":
      case "DecodeError":
      case "EmptyBodyError":
        return Effect.succeed(unexpectedResponse);
      default:
        return Effect.succeed(unexpectedFailure);
    }
  }
  if (Schema.isSchemaError(error)) return Effect.succeed(unexpectedResponse);
  if (HttpServerRespondable.isRespondable(error)) return encodeServerProblem(error);
  return Effect.succeed(unexpectedFailure);
};
