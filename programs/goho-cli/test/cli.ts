import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Path, Stream } from "effect";
import {
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  type HttpServerResponse as HttpServerResponseType,
} from "effect/http";
import { ChildProcess } from "effect/process";

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
export const runCommand = (baseUrl: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../src/main.ts", import.meta.url));
    const child = yield* ChildProcess.make(process.execPath, [mainPath, ...args], {
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
) => withResponse(Effect.succeed(HttpServerResponse.jsonUnsafe(body, { status })), run);
