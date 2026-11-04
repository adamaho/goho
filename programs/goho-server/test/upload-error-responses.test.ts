import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import * as UploadErrorResponses from "#src/upload-error-responses.ts";

const expected = {
  error: {
    code: "invalid_input",
    message:
      "Upload exceeds a multipart limit. Send one image up to 20 MiB with a total request up to 21 MiB.",
  },
};

it.effect("only replaces 413 bodies on upload POST routes and preserves response headers", () => {
  const routes = Layer.mergeAll(
    HttpRouter.add(
      "POST",
      "/book-uploads",
      HttpServerResponse.empty({ status: 413, headers: { "x-upload-limit": "kept" } }),
    ),
    HttpRouter.add("POST", "/receipt-uploads", HttpServerResponse.empty({ status: 413 })),
    HttpRouter.add("GET", "/book-uploads", HttpServerResponse.empty({ status: 413 })),
    HttpRouter.add("POST", "/receipts", HttpServerResponse.empty({ status: 413 })),
  ).pipe(Layer.provide(UploadErrorResponses.layer));
  return Effect.gen(function* () {
    const book = yield* HttpClient.post("/book-uploads?source=test");
    expect(book.status).toBe(413);
    expect(book.headers["content-type"]).toContain("application/json");
    expect(book.headers["x-upload-limit"]).toBe("kept");
    expect(yield* book.json).toEqual(expected);
    const receipt = yield* HttpClient.post("/receipt-uploads");
    expect(receipt.status).toBe(413);
    expect(yield* receipt.json).toEqual(expected);
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

it.effect("does not rewrite other upload response statuses", () => {
  const routes = Layer.mergeAll(
    HttpRouter.add(
      "POST",
      "/book-uploads",
      HttpServerResponse.text("unsupported", { status: 415 }),
    ),
  ).pipe(Layer.provide(UploadErrorResponses.layer));
  return Effect.gen(function* () {
    const response = yield* HttpClient.post("/book-uploads");
    expect(response.status).toBe(415);
    expect(yield* response.text).toBe("unsupported");
  }).pipe(
    Effect.provide(HttpRouter.serve(routes).pipe(Layer.provideMerge(NodeHttpServer.layerTest))),
  );
});
