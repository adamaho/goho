import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";

import { NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import { Context, Effect, FileSystem, Layer } from "effect";
import { type Headers, HttpServer, HttpServerRequest, type HttpServerResponse } from "effect/http";

import * as WebFetch from "#src/services/web-fetch.ts";

// Self-signed certificate and key for recipes.test only.
const readTls = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return {
    cert: yield* fileSystem.readFileString(`${import.meta.dirname}/../tls/recipes.test.crt`),
    key: yield* fileSystem.readFileString(`${import.meta.dirname}/../tls/recipes.test.key`),
  };
}).pipe(Effect.provide(NodeFileSystem.layer), Effect.orDie);

/**
 * Serves `handler` on a loopback port for the scope's lifetime, over HTTPS
 * with the `recipes.test` certificate when `secure`, recording each request
 * path in `paths` and its headers in `headers`.
 *
 * @category testing
 * @since 0.1.0
 */
export const serve = Effect.fnUntraced(function* (options: {
  readonly handler: (path: string) => Effect.Effect<HttpServerResponse.HttpServerResponse>;
  readonly secure?: boolean;
}) {
  const tls = yield* readTls;
  const context = yield* Layer.build(
    NodeHttpServer.layer(
      () => (options.secure === true ? createSecureServer(tls) : createServer()),
      { port: 0, host: "127.0.0.1" },
    ),
  );
  const server = Context.get(context, HttpServer.HttpServer);
  const paths: Array<string> = [];
  const headers: Array<Headers.Headers> = [];
  yield* server.serve(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      paths.push(request.url);
      headers.push(request.headers);
      return yield* options.handler(request.url);
    }),
  );
  return { port: "port" in server.address ? server.address.port : 0, paths, headers };
});

/**
 * Loopback address a fake resolver can answer with.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const loopback = { address: "127.0.0.1", family: 4 };

/**
 * Resolver answering from fixed records; other names have no address.
 *
 * @category testing
 * @since 0.1.0
 */
export const hosts =
  (records: Record<string, ReadonlyArray<{ address: string; family: number }>>): WebFetch.Resolve =>
  (hostname) =>
    Promise.resolve(records[hostname] ?? []);

/**
 * WebFetch client that treats loopback as a public server, so tests can
 * serve fixtures; every other address keeps the real policy.
 *
 * @category testing
 * @since 0.1.0
 */
export const loopbackClient = Effect.fnUntraced(function* (resolve: WebFetch.Resolve) {
  const { cert } = yield* readTls;
  return yield* WebFetch.make({
    resolve,
    isAllowed: (address) => address === "127.0.0.1" || WebFetch.isPublicAddress(address),
    ca: cert,
  });
});
