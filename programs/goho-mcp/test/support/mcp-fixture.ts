import { createServer } from "node:http";

import { NodeHttpServer, NodeHttpServerRequest } from "@effect/platform-node";
import { Context, Effect, Layer, Ref } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

import { connectMcpClient, startMcpServer } from "./mcp-client.ts";

/**
 * Handles one request to the fake Goho API.
 *
 * @category testing
 * @since 0.1.0
 */
export type ApiRoutes = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  unknown,
  HttpServerRequest.HttpServerRequest
>;

/**
 * One real MCP program and its fake Goho API, shared by the tests in a module.
 *
 * @category testing
 * @since 0.1.0
 */
export class Service extends Context.Service<
  Service,
  {
    readonly url: string;
    readonly openSession: ReturnType<typeof connectMcpClient>;
    readonly respondWith: (routes: ApiRoutes) => Effect.Effect<void>;
    readonly apiRequests: Effect.Effect<ReadonlyArray<string>>;
  }
>()("@goho/goho-mcp/test/McpFixture") {}

/**
 * Starts the fake API, then the MCP program against it. The layer releases in reverse, so the
 * program stops first.
 *
 * @category testing
 * @since 0.1.0
 */
export const layer = (routes: ApiRoutes) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const currentRoutes = yield* Ref.make(routes);
      const requests = yield* Ref.make<ReadonlyArray<string>>([]);

      yield* HttpServer.serveEffect()(
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          yield* Ref.update(requests, (seen) => [...seen, `${request.method} ${request.url}`]);
          // Server handlers are uninterruptible, so a stalled route would block shutdown otherwise.
          return yield* Effect.interruptible(Effect.flatten(Ref.get(currentRoutes)));
        }),
      );

      const { url } = yield* startMcpServer(HttpServer.formatAddress(server.address));

      return Service.of({
        url,
        openSession: Effect.andThen(
          Effect.all([Ref.set(currentRoutes, routes), Ref.set(requests, [])], { discard: true }),
          connectMcpClient(url),
        ),
        respondWith: (next) => Ref.set(currentRoutes, next),
        apiRequests: Ref.get(requests),
      });
    }),
  ).pipe(Layer.provide(NodeHttpServer.layer(() => createServer(), { host: "127.0.0.1", port: 0 })));

/**
 * Budget for a program cold start, which can take several seconds on a busy CI runner.
 *
 * @category testing
 * @since 0.1.0
 */
export const coldStartTimeout = 30_000;

/**
 * Options for a module's `layer`. Startup runs in the suite's setup under its own budget, and the
 * real clock keeps the HTTP server's shutdown timer running.
 *
 * @category testing
 * @since 0.1.0
 */
export const moduleOptions = { timeout: coldStartTimeout, excludeTestServices: true };

/**
 * Starts a test: resets the fake API to the module's routes and opens a fresh MCP session.
 *
 * @category testing
 * @since 0.1.0
 */
export const openSession = Service.use((fixture) => fixture.openSession);

/**
 * Replaces the fake API's routes until the next session opens.
 *
 * @category testing
 * @since 0.1.0
 */
export const respondWith = (routes: ApiRoutes) =>
  Service.use((fixture) => fixture.respondWith(routes));

/**
 * Requests the fake API received since the session opened, as `METHOD url`.
 *
 * @category testing
 * @since 0.1.0
 */
export const apiRequests = Service.use((fixture) => fixture.apiRequests);

/**
 * Fake API routes that break the connection without an HTTP response, so the program sees a
 * transport failure while its API URL stays the same.
 *
 * @category testing
 * @since 0.1.0
 */
export const dropConnections: ApiRoutes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  yield* Effect.sync(() => NodeHttpServerRequest.toIncomingMessage(request).socket.destroy());
  return HttpServerResponse.empty();
});
