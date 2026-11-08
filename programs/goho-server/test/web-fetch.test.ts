import { it } from "@effect/vitest";
import { type Duration, Effect, Predicate, Result, Stream } from "effect";
import { HttpServerResponse } from "effect/http";
import { describe, expect } from "vitest";

import * as WebFetch from "#src/services/web-fetch.ts";
import { hosts, loopback, loopbackClient, serve } from "#test/helpers/web.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

const responses: ReadonlyMap<string, HttpServerResponse.HttpServerResponse> = new Map(
  Object.entries({
    "/page": HttpServerResponse.text("<p>Pancakes</p>", { contentType: "text/html" }),
    "/start": HttpServerResponse.redirect("/page"),
    "/to-private-name": HttpServerResponse.redirect("http://internal.test/admin"),
    "/to-metadata": HttpServerResponse.redirect("http://169.254.169.254/latest/meta-data"),
    "/to-ftp": HttpServerResponse.redirect("ftp://recipes.test/page"),
    "/to-credentials": HttpServerResponse.redirect("http://cook:secret@recipes.test/page"),
    "/missing": HttpServerResponse.empty({ status: 404 }),
    "/busy": HttpServerResponse.empty({ status: 503 }),
    "/gzip": HttpServerResponse.text("", { headers: { "content-encoding": "gzip" } }),
    "/declared-large": HttpServerResponse.text("x".repeat(33)),
    // Chunked, with no length to check up front.
    "/streamed-large": HttpServerResponse.stream(
      Stream.make(bytes("x".repeat(20)), bytes("x".repeat(20))),
    ),
  }),
);

const handler = (path: string) => {
  if (path.startsWith("/loop/")) {
    return Effect.succeed(HttpServerResponse.redirect(`/loop/${Number(path.slice(6)) + 1}`));
  }
  const response = responses.get(path);
  // Anything else, such as "/stall", answers only after the client has given up.
  return response === undefined
    ? Effect.sleep("1 second").pipe(Effect.as(HttpServerResponse.empty()))
    : Effect.succeed(response);
};

const get = (http: WebFetch.Interface, url: string, timeout: Duration.Input = "5 seconds") =>
  http.get({ url, accept: "text/html", maxBytes: 32, timeout }).pipe(Effect.result);

const failureOf = <A>(result: Result.Result<A, WebFetch.FetchError>) =>
  Result.isFailure(result)
    ? { reason: result.failure.reason, retryable: result.failure.retryable }
    : "succeeded";

const terminal = (reason: WebFetch.FetchError["reason"]) => ({ reason, retryable: false });

describe("isPublicAddress", () => {
  it.each([
    ["93.184.215.14", true],
    ["2606:4700::6810:84e5", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["192.168.1.1", false],
    ["100.64.0.1", false],
    ["169.254.169.254", false],
    ["0.0.0.0", false],
    ["198.18.0.1", false],
    ["224.0.0.1", false],
    ["255.255.255.255", false],
    ["::1", false],
    ["::", false],
    ["fe80::1", false],
    ["fd00::1", false],
    ["ff02::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:7f00:1", false],
    ["::ffff:93.184.215.14", false],
    ["64:ff9b::a00:1", false],
    ["2001:db8::1", false],
    ["2002:a00:1::", false],
    ["2001::1", false],
    ["localhost", false],
  ])("%s is public: %s", (address, expected) => {
    expect(WebFetch.isPublicAddress(address)).toBe(expected);
  });
});

it.live(
  "rejects non-public IP literals and credentials in any URL without resolving or connecting",
  () =>
    Effect.gen(function* () {
      const server = yield* serve({ handler });
      const resolved: Array<string> = [];
      const http = yield* WebFetch.make({
        resolve: (hostname) => {
          resolved.push(hostname);
          return Promise.resolve([]);
        },
        isAllowed: WebFetch.isPublicAddress,
      });
      for (const url of [
        `http://127.0.0.1:${server.port}/page`,
        "http://0x7f.1/",
        "http://2130706433/",
        "http://017700000001/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "https://169.254.169.254/latest/meta-data",
      ]) {
        expect([url, failureOf(yield* get(http, url))]).toEqual([url, terminal("blocked_address")]);
      }
      for (const url of [
        "ftp://recipes.test/",
        "file:///etc/passwd",
        "not a url",
        "https://cook:secret@recipes.test/page",
        "https://cook@recipes.test/page",
        "https://:secret@recipes.test/page",
      ]) {
        expect(failureOf(yield* get(http, url))).toEqual(terminal("invalid_url"));
      }
      expect(resolved).toEqual([]);
      expect(server.paths).toEqual([]);
    }),
);

it.live("follows redirects to the final public page and reports where it ended", () =>
  Effect.gen(function* () {
    const server = yield* serve({ handler });
    const http = yield* loopbackClient(hosts({ "recipes.test": [loopback] }));
    const result = yield* get(http, `http://recipes.test:${server.port}/start#method`);
    const response = Result.getOrThrow(result);
    expect(response.url.href).toBe(`http://recipes.test:${server.port}/page`);
    expect(response.contentType).toBe("text/html");
    expect(new TextDecoder().decode(response.body)).toBe("<p>Pancakes</p>");
    expect(server.paths).toEqual(["/start", "/page"]);
    // The importer's trace context stays inside Goho on every hop.
    for (const headers of server.headers) {
      expect(
        Object.keys(headers).filter((name) => /^(traceparent|tracestate|b3)$|^x-b3-/.test(name)),
      ).toEqual([]);
    }
    expect(server.headers).toHaveLength(2);
  }),
);

it.live("checks every redirect target before connecting to it", () =>
  Effect.gen(function* () {
    const server = yield* serve({ handler });
    const http = yield* loopbackClient(
      hosts({
        "recipes.test": [loopback],
        "internal.test": [{ address: "10.0.0.7", family: 4 }],
      }),
    );
    const base = `http://recipes.test:${server.port}`;
    expect(failureOf(yield* get(http, `${base}/to-private-name`))).toEqual(
      terminal("blocked_address"),
    );
    expect(failureOf(yield* get(http, `${base}/to-metadata`))).toEqual(terminal("blocked_address"));
    expect(failureOf(yield* get(http, `${base}/to-ftp`))).toEqual(terminal("invalid_url"));
    // Refused before connecting, not followed with the credentials dropped.
    expect(failureOf(yield* get(http, `${base}/to-credentials`))).toEqual(terminal("invalid_url"));
    expect(failureOf(yield* get(http, `${base}/loop/0`))).toEqual(terminal("redirect"));
    // The first request plus five followed redirects.
    expect(server.paths.filter((path) => path.startsWith("/loop/"))).toEqual([
      "/loop/0",
      "/loop/1",
      "/loop/2",
      "/loop/3",
      "/loop/4",
      "/loop/5",
    ]);
  }),
);

it.live("refuses a host when any resolved address is not public", () =>
  Effect.gen(function* () {
    const server = yield* serve({ handler });
    const http = yield* loopbackClient(
      hosts({ "mixed.test": [loopback, { address: "192.168.0.10", family: 4 }] }),
    );
    expect(failureOf(yield* get(http, `http://mixed.test:${server.port}/page`))).toEqual(
      terminal("blocked_address"),
    );
    expect(server.paths).toEqual([]);
  }),
);

it.live("connects to the address it checked, so a rebinding resolver cannot redirect it", () =>
  Effect.gen(function* () {
    const server = yield* serve({ handler, secure: true });
    const lookups: Array<string> = [];
    // Answers with an allowed address once, then rebinds to a private one.
    const http = yield* loopbackClient((hostname) => {
      lookups.push(hostname);
      return Promise.resolve(
        lookups.length === 1 ? [loopback] : [{ address: "10.0.0.1", family: 4 }],
      );
    });
    const result = yield* get(http, `https://recipes.test:${server.port}/page`);
    expect(new TextDecoder().decode(Result.getOrThrow(result).body)).toBe("<p>Pancakes</p>");
    expect(lookups).toEqual(["recipes.test"]);
  }),
);

it.live("verifies TLS against the URL's hostname, not the pinned address", () =>
  Effect.gen(function* () {
    const server = yield* serve({ handler, secure: true });
    const http = yield* loopbackClient(hosts({ "other.test": [loopback] }));
    // The fixture certificate names recipes.test only.
    const result = yield* get(http, `https://other.test:${server.port}/page`);
    expect(failureOf(result)).toEqual({ reason: "transport", retryable: true });
    const codes: Array<unknown> = [];
    for (
      let cause: unknown = Result.isFailure(result) ? result.failure.cause : undefined;
      cause instanceof Error;
      cause = cause.cause
    ) {
      if (Predicate.hasProperty(cause, "code")) codes.push(cause.code);
    }
    expect(codes).toContain("ERR_TLS_CERT_ALTNAME_INVALID");
    expect(server.paths).toEqual([]);
  }),
);

it.live("bounds bodies, encodings, statuses and time", () =>
  Effect.gen(function* () {
    const server = yield* serve({ handler });
    const http = yield* loopbackClient(hosts({ "recipes.test": [loopback] }));
    const base = `http://recipes.test:${server.port}`;
    expect(failureOf(yield* get(http, `${base}/declared-large`))).toEqual(terminal("too_large"));
    expect(failureOf(yield* get(http, `${base}/streamed-large`))).toEqual(terminal("too_large"));
    expect(failureOf(yield* get(http, `${base}/gzip`))).toEqual(terminal("encoding"));
    expect(failureOf(yield* get(http, `${base}/missing`))).toEqual(terminal("status"));
    expect(failureOf(yield* get(http, `${base}/busy`))).toEqual({
      reason: "status",
      retryable: true,
    });
    expect(failureOf(yield* get(http, `${base}/stall`, "200 millis"))).toEqual({
      reason: "timeout",
      retryable: true,
    });
  }),
);
