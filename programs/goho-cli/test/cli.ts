import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Path, Stream } from "effect";
import {
  HttpServer,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  type HttpServerResponse as HttpServerResponseType,
  type ProblemDetails,
} from "effect/http";
import { HttpApiError } from "effect/http-api";
import { ChildProcess } from "effect/process";

/**
 * Native HTTP validation problem returned by CLI test servers.
 *
 * @category testing
 * @since 0.1.0
 */
export const validationProblem = new HttpApiError.BadRequestProblem({
  detail: "Request validation failed",
});

/**
 * Native HTTP validation response returned by CLI test servers.
 *
 * @category testing
 * @since 0.1.0
 */
export const validationResponse = HttpServerRespondable.toResponse(validationProblem);

/**
 * Renders a declared Problem as the server would, or any other body as JSON.
 *
 * @category testing
 * @since 0.1.0
 */
export const toTestResponse = (status: number, body: unknown) =>
  HttpServerRespondable.isRespondable(body)
    ? HttpServerRespondable.toResponse(body)
    : Effect.succeed(HttpServerResponse.jsonUnsafe(body, { status }));

const cliTitles = {
  "goho:cli:invalid-input": "Invalid command input",
  "goho:cli:configuration-error": "Invalid CLI configuration",
  "goho:cli:connection-failed": "Could not reach the Goho server",
  "goho:cli:file-error": "Local file error",
  "goho:cli:unexpected-response": "Unexpected server response",
  "goho:cli:unexpected-failure": "Unexpected failure",
} as const;

/**
 * Expected stderr for one problem, printed as written.
 *
 * @category testing
 * @since 0.1.0
 */
export const problemOutput = (problem: ProblemDetails.ProblemDetails) =>
  `${JSON.stringify(problem, null, 2)}\n`;

/**
 * Expected stderr for a failure the CLI detects itself.
 *
 * @category testing
 * @since 0.1.0
 */
export const cliProblemOutput = (type: keyof typeof cliTitles, detail: string) =>
  problemOutput({ type, title: cliTitles[type], detail });

/**
 * Expected stderr for a declared server problem without extensions: its public
 * members in the order the CLI prints them.
 *
 * @category testing
 * @since 0.1.0
 */
export const serverProblemOutput = (problem: {
  readonly type: string;
  readonly status: number;
  readonly title: string;
  readonly detail?: string | undefined;
}) => {
  const { type, status, title, detail } = problem;
  return problemOutput(
    detail === undefined ? { type, status, title } : { type, status, title, detail },
  );
};

/**
 * Detail for a server that refuses or drops the connection.
 *
 * @category testing
 * @since 0.1.0
 */
export const connectionDetail = "Check that it is running and that GOHO_SERVER_URL is correct.";

/**
 * Detail for a response the CLI could not read.
 *
 * @category testing
 * @since 0.1.0
 */
export const unexpectedResponseDetail =
  "The server sent a response the CLI could not read. Check that GOHO_SERVER_URL points to a Goho server.";

/**
 * Captured output from one CLI process.
 *
 * @category testing
 * @since 0.1.0
 */
export interface CliResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Runs the CLI against a test server URL.
 *
 * @category testing
 * @since 0.1.0
 */
export const runCommand = (baseUrl: string, args: ReadonlyArray<string>, cwd = process.cwd()) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../src/main.ts", import.meta.url));
    const child = yield* ChildProcess.make(process.execPath, [mainPath, ...args], {
      cwd,
      env: { GOHO_SERVER_URL: baseUrl },
      extendEnv: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    return yield* Effect.all(
      {
        code: child.exitCode,
        stderr: child.stderr.pipe(Stream.decodeText(), Stream.mkString),
        stdout: child.stdout.pipe(Stream.decodeText(), Stream.mkString),
      },
      { concurrency: "unbounded" },
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

/**
 * Runs a callback while a scoped Effect HTTP test server serves a response.
 *
 * @category testing
 * @since 0.1.0
 */
export const withResponse = async <A>(
  response: Effect.Effect<
    HttpServerResponseType.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  >,
  run: (baseUrl: string) => Promise<A>,
) => {
  const ServerLive = HttpServer.serve(response).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    return yield* Effect.tryPromise(() => run(HttpServer.formatAddress(server.address))).pipe(
      Effect.orDie,
    );
  }).pipe(Effect.provide(ServerLive), Effect.scoped, Effect.runPromise);
};

/**
 * Runs a callback while a scoped test server serves one JSON response.
 *
 * @category testing
 * @since 0.1.0
 */
export const withJsonResponse = <A>(
  status: number,
  body: unknown,
  run: (baseUrl: string) => Promise<A>,
) => withResponse(toTestResponse(status, body), run);
