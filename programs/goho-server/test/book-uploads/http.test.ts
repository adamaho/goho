import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { BookUpload, BookUploadId, BookUploadsUnavailable } from "@goho/goho-api/book-uploads";
import { BookId } from "@goho/goho-api/books";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as Http from "#src/http.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";

const bookUpload = BookUpload.make({
  id: BookUploadId.make("3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b"),
  fileName: "cover.webp",
  contentType: "image/webp",
  status: "succeeded",
  bookId: BookId.make("12"),
  failureCode: null,
  createdAt: "2026-10-20 14:00:00+00",
  updatedAt: "2026-10-20 14:00:09+00",
});

// Records what reaches the service, so boundary rejections can prove nothing did.
const testLayer = (uploads: Partial<BookUploads.Interface> = {}) => {
  const calls: Array<unknown> = [];
  const layer = HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide([
        Layer.succeed(
          BookUploads.Service,
          BookUploads.Service.of({
            create: (input) =>
              Effect.sync(() => {
                calls.push(["create", { ...input, bytes: [...input.bytes] }]);
                return bookUpload;
              }),
            ...uploads,
          }),
        ),
        Layer.mock(Books.Service, {}),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(ReceiptUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return { calls, layer };
};

const coverForm = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

it.effect("uploads cover scans through the generated client", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    const form = coverForm(
      new File([new Uint8Array([1, 2, 3])], "cover.webp", { type: "image/webp" }),
    );
    expect(yield* client.bookUploads.create({ payload: form })).toEqual({ data: bookUpload });
    const accepted = yield* HttpClient.post("/book-uploads", { body: HttpBody.formData(form) });
    expect(accepted.status).toBe(202);
    const upload = { name: "cover.webp", contentType: "image/webp", bytes: [1, 2, 3] };
    expect(calls).toEqual([
      ["create", upload],
      ["create", upload],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("rejects unsupported cover uploads before the service", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    for (const file of [
      new File(["not an image"], "cover.txt", { type: "text/plain" }),
      new File([new Uint8Array([1])], "cover.gif", { type: "image/gif" }),
    ]) {
      const response = yield* HttpClient.post("/book-uploads", {
        body: HttpBody.formData(coverForm(file)),
      });
      expect(response.status, file.name).toBe(400);
    }
    expect(calls).toEqual([]);
  }).pipe(Effect.provide(layer));
});

// Uses the live clock because this waits on a real socket: the 413 takes several
// seconds to arrive and the connection is then reset. Its own server keeps that
// reset away from other requests.
it.live(
  "rejects a cover over the shared 20 MiB upload limit before the service",
  () => {
    const { calls, layer } = testLayer();
    return Effect.gen(function* () {
      const file = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "cover.png", {
        type: "image/png",
      });
      const response = yield* HttpClient.post("/book-uploads", {
        body: HttpBody.formData(coverForm(file)),
      });
      expect(response.status).toBe(413);
      expect(calls).toEqual([]);
    }).pipe(Effect.provide(layer));
  },
  15_000,
);

it.effect("returns cover upload domain errors with their declared statuses", () =>
  Effect.gen(function* () {
    const form = coverForm(new File([new Uint8Array([1])], "cover.png", { type: "image/png" }));
    const cases = [
      {
        uploads: { create: () => Effect.fail(new BookUploadsUnavailable()) },
        request: HttpClient.post("/book-uploads", { body: HttpBody.formData(form) }),
        status: 500,
        tag: "BookUploadsUnavailable",
      },
    ];
    for (const { uploads, request, status, tag } of cases) {
      yield* Effect.gen(function* () {
        const response = yield* request;
        expect(response.status, tag).toBe(status);
        expect(yield* response.json).toEqual({ _tag: tag });
      }).pipe(Effect.provide(testLayer(uploads).layer));
    }
  }),
);
