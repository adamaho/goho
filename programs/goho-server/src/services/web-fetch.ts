import * as Dns from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { NodeHttpClient } from "@effect/platform-node";
import { Context, Data, type Duration, Effect, Layer, Schema, Stream } from "effect";
import { HttpClient, type HttpClientError, HttpClientRequest } from "effect/http";

/**
 * A public page or file fetch that failed. `retryable` is true only for
 * failures a later attempt can plausibly get past: transport errors, timeouts,
 * and 408, 429 or 5xx responses.
 *
 * @category errors
 * @since 0.1.0
 */
export class FetchError extends Schema.TaggedError<FetchError>()("GohoServer.WebFetch.FetchError", {
  reason: Schema.Literals([
    "invalid_url",
    "blocked_address",
    "redirect",
    "status",
    "encoding",
    "too_large",
    "timeout",
    "transport",
  ]),
  retryable: Schema.Boolean,
  cause: Schema.Defect(),
}) {}

/**
 * One GET of a public URL. `maxBytes` bounds the body and `timeout` the whole
 * fetch, redirects included.
 *
 * @category models
 * @since 0.1.0
 */
export interface Request {
  readonly url: string;
  readonly accept: string;
  readonly maxBytes: number;
  readonly timeout: Duration.Input;
}

/**
 * A successful response. `url` is where the last redirect led, for resolving
 * relative links; it never replaces the requested URL as an identity.
 *
 * @category models
 * @since 0.1.0
 */
export interface Response {
  readonly url: URL;
  readonly contentType: string | null;
  readonly body: Uint8Array;
}

/**
 * GETs of public internet URLs only.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Follows up to five redirects, checking every URL before connecting: http
   * or https only, no username or password, and every address the host resolves to must be public. The
   * connection uses the checked address, so DNS cannot rebind between the
   * check and the connect; TLS still verifies the URL's hostname. Asks for an
   * uncompressed body and fails on any other encoding.
   */
  readonly get: (request: Request) => Effect.Effect<Response, FetchError>;
}

/**
 * Service identifier for public internet GETs.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/goho-server/WebFetch") {}

/** Most redirects one fetch follows. */
const maxRedirects = 5;

// IANA special-purpose IPv4 ranges: none is reachable as a public website.
const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

// Only global unicast (2000::/3) is public. Everything outside it, which takes in
// loopback, unspecified, IPv4-mapped and -compatible, NAT64, unique local,
// link-local and multicast, is blocked, as are the special ranges inside it:
// protocol assignments including Teredo, documentation and 6to4.
const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["::", 3],
  ["4000::", 2],
  ["8000::", 1],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

/**
 * Whether an IP address is a public internet address. Anything that is not an
 * IP address is not.
 *
 * @category policies
 * @since 0.1.0
 */
export const isPublicAddress = (address: string): boolean => {
  // Separate lists: Node checks an IPv4 address against IPv6 rules through its
  // mapped form, which `::/3` would block.
  switch (isIP(address)) {
    case 4:
      return !blockedIpv4.check(address, "ipv4");
    case 6:
      return !blockedIpv6.check(address, "ipv6");
    default:
      return false;
  }
};

/**
 * Resolves a hostname to every address a connection could use.
 *
 * @category models
 * @since 0.1.0
 */
export type Resolve = (hostname: string) => Promise<ReadonlyArray<Dns.LookupAddress>>;

const resolveWithSystem: Resolve = (hostname) =>
  Dns.promises.lookup(hostname, { all: true, order: "verbatim" });

class BlockedAddress extends Error {}

// Connections resolve through this lookup only, and connect to the addresses it
// returns, so the addresses checked are the addresses used.
const pinnedLookup =
  (resolve: Resolve, isAllowed: (address: string) => boolean): LookupFunction =>
  (hostname, options, callback) => {
    resolve(hostname).then(
      (resolved) => {
        const blocked = resolved.find((entry) => !isAllowed(entry.address));
        if (blocked !== undefined) {
          return callback(
            new BlockedAddress(`${hostname} resolves to a non-public address ${blocked.address}`),
            "",
          );
        }
        const addresses =
          options.family === 4 || options.family === 6
            ? resolved.filter((entry) => entry.family === options.family)
            : resolved;
        const [first] = addresses;
        if (first === undefined) {
          return callback(
            Object.assign(new Error(`${hostname} has no usable address`), { code: "ENOTFOUND" }),
            "",
          );
        }
        return options.all === true
          ? callback(null, [...addresses])
          : callback(null, first.address, first.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, ""),
    );
  };

const fail = (reason: FetchError["reason"], cause: unknown, retryable = false) =>
  new FetchError({ reason, retryable, cause });

const checkTarget = (
  value: string,
  base: URL | undefined,
  isAllowed: (address: string) => boolean,
): Effect.Effect<URL, FetchError> => {
  const url = URL.parse(value, base?.href);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return Effect.fail(fail("invalid_url", `Not an absolute http or https URL: ${value}`));
  }
  // Credentials are refused, never dropped: a redirect or photo URL can carry
  // them past the API's own check.
  if (url.username !== "" || url.password !== "") {
    return Effect.fail(fail("invalid_url", `URL has a username or password: ${url.host}`));
  }
  // An IP literal skips DNS, so check it here; the parser has already turned
  // forms such as 0x7f.1 or 2130706433 into dotted IPv4.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (isIP(host) !== 0 && !isAllowed(host)) {
    return Effect.fail(fail("blocked_address", `Non-public address ${host}`));
  }
  return Effect.succeed(url);
};

// A lookup refusal reaches here wrapped in transport errors; anything else is
// a connection or protocol failure a later attempt might get past.
const fromClientError = (error: HttpClientError.HttpClientError): FetchError => {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof BlockedAddress) return fail("blocked_address", cause.message);
  }
  return fail("transport", error, true);
};

// One request's outcome: a redirect to follow, or the final response.
type Hop = Data.TaggedEnum<{
  Redirect: { readonly location: string };
  Done: { readonly response: Response };
}>;

const Hop = Data.taggedEnum<Hop>();

const isRedirect = (status: number) =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

/**
 * Builds a web fetch client. `isAllowed` decides which resolved and literal
 * addresses may be used, and `resolve` does DNS; tests replace them to serve
 * fixtures from loopback. `ca` adds trusted certificates for test servers.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (options: {
  readonly resolve: Resolve;
  readonly isAllowed: (address: string) => boolean;
  readonly ca?: string;
}) {
  const lookup = pinnedLookup(options.resolve, options.isAllowed);

  const dispatcher = yield* NodeHttpClient.makeDispatcherOptions({
    connect: options.ca === undefined ? { lookup } : { lookup, ca: options.ca },
  });

  const client = (yield* NodeHttpClient.makeUndici.pipe(
    Effect.provideService(NodeHttpClient.Dispatcher, dispatcher),
  )).pipe(
    HttpClient.withScope,
    // Trace headers such as traceparent and b3 would leak Goho's tracing to third-party sites.
    HttpClient.transform((effect) =>
      Effect.provideService(effect, HttpClient.TracerPropagationEnabled, false),
    ),
  );

  // One request; the scope aborts it and frees the connection once handled.
  const send = (url: URL, request: Request) =>
    Effect.scoped(
      Effect.gen(function* () {
        const response = yield* client
          .execute(
            HttpClientRequest.get(url, {
              headers: {
                accept: request.accept,
                "accept-encoding": "identity",
                "user-agent": "Goho recipe importer",
              },
            }),
          )
          .pipe(Effect.mapError(fromClientError));
        const { status, headers } = response;
        if (isRedirect(status) && headers.location !== undefined) {
          return Hop.Redirect({ location: headers.location });
        }
        if (status < 200 || status > 299) {
          return yield* fail("status", `HTTP ${status}`, isRetryableStatus(status));
        }
        const encoding = headers["content-encoding"]?.trim().toLowerCase();
        if (encoding !== undefined && encoding !== "" && encoding !== "identity") {
          return yield* fail("encoding", `Unsupported content encoding ${encoding}`);
        }
        const tooLarge = fail("too_large", `Body over ${request.maxBytes} bytes`);
        if (Number(headers["content-length"] ?? 0) > request.maxBytes) return yield* tooLarge;
        let size = 0;
        const chunks = yield* response.stream.pipe(
          Stream.mapError(fromClientError),
          Stream.mapEffect((chunk) => {
            size += chunk.byteLength;
            return size > request.maxBytes ? Effect.fail(tooLarge) : Effect.succeed(chunk);
          }),
          Stream.runCollect,
        );
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return Hop.Done({
          response: { url, contentType: headers["content-type"] ?? null, body },
        });
      }),
    );

  const get = Effect.fn("@goho/WebFetch.get")(function* (request: Request) {
    let url = yield* checkTarget(request.url, undefined, options.isAllowed);
    const fetchAll = Effect.gen(function* () {
      for (let redirects = 0; ; redirects++) {
        const result = yield* send(url, request);
        if (result._tag === "Done") return result.response;
        if (redirects === maxRedirects) {
          return yield* fail("redirect", `More than ${maxRedirects} redirects`);
        }
        url = yield* checkTarget(result.location, url, options.isAllowed);
      }
    });
    return yield* fetchAll.pipe(
      Effect.timeoutOrElse({
        duration: request.timeout,
        orElse: () => Effect.fail(fail("timeout", `No response within the time limit`, true)),
      }),
    );
  });

  return Service.of({ get });
});

/**
 * Fetches from public internet addresses through the system resolver.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  make({ resolve: resolveWithSystem, isAllowed: isPublicAddress }),
);
