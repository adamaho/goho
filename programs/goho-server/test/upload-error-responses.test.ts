import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpRouter, HttpServerResponse, Multipart } from "effect/http";
import { expect } from "vitest";

import * as UploadErrorResponses from "#src/upload-error-responses.ts";

const expected = {
  type: "goho:problem:upload-limit-exceeded",
  status: 413,
  title: "Upload limit exceeded",
  detail:
    "Upload exceeds a multipart limit. Send one image up to 20 MB with a total request up to 21 MB.",
};

it.effect("only replaces 413 bodies on upload POST routes and preserves response headers", () => {
  const routes = Layer.mergeAll(
    HttpRouter.add(
      "POST",
      "/book-uploads",
      HttpServerResponse.empty({ status: 413, headers: { "x-upload-limit": "kept" } }),
    ),
    HttpRouter.add("GET", "/book-uploads", HttpServerResponse.empty({ status: 413 })),
    HttpRouter.add("POST", "/receipts", HttpServerResponse.empty({ status: 413 })),
  ).pipe(Layer.provide(UploadErrorResponses.layer));
  return Effect.gen(function* () {
    const book = yield* HttpClient.post("/book-uploads?source=test");
    expect(book.status).toBe(413);
    expect(book.headers["content-type"]).toContain("application/problem+json");
    expect(book.headers["x-upload-limit"]).toBe("kept");
    expect(yield* book.json).toEqual(expected);
    for (const response of [
      yield* HttpClient.get("/book-uploads"),
      yield* HttpClient.post("/receipts"),
    ]) {
      expect(response.status).toBe(413);
      expect(yield* response.text).toBe("");
    }
  }).pipe(
    Effect.provide(HttpRouter.serve(routes).pipe(Layer.provideMerge(NodeHttpServer.layerTest))),
  );
});

it.effect("renders every multipart limit reason, on both routes, as the shared problem", () =>
  Effect.gen(function* () {
    for (const path of ["/book-uploads", "/receipt-uploads"] as const) {
      for (const reason of [
        "FileTooLarge",
        "FieldTooLarge",
        "BodyTooLarge",
        "TooManyParts",
      ] as const) {
        const routes = HttpRouter.add(
          "POST",
          path,
          Effect.die(Multipart.MultipartError.fromReason(reason)),
        ).pipe(Layer.provide(UploadErrorResponses.layer));
        const response = yield* HttpClient.post(path).pipe(
          Effect.provide(
            HttpRouter.serve(routes).pipe(Layer.provideMerge(NodeHttpServer.layerTest)),
          ),
        );
        expect(response.status, `${path} ${reason}`).toBe(413);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        expect(yield* response.json).toEqual(expected);
      }
    }
  }),
);

it.effect("does not rewrite other upload response statuses or multipart failures", () =>
  Effect.gen(function* () {
    for (const [handler, status, body] of [
      [HttpServerResponse.text("unsupported", { status: 415 }), 415, "unsupported"],
      [Effect.die(Multipart.MultipartError.fromReason("Parse")), 400, ""],
      [Effect.die(Multipart.MultipartError.fromReason("InternalError")), 500, ""],
    ] as const) {
      const routes = HttpRouter.add("POST", "/book-uploads", handler).pipe(
        Layer.provide(UploadErrorResponses.layer),
      );
      const response = yield* HttpClient.post("/book-uploads").pipe(
        Effect.provide(HttpRouter.serve(routes).pipe(Layer.provideMerge(NodeHttpServer.layerTest))),
      );
      expect(response.status).toBe(status);
      expect(yield* response.text).toBe(body);
    }
  }),
);
