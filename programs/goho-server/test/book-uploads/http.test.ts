import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import {
  BookUpload,
  BookUploadConflict,
  BookUploadGone,
  BookUploadId,
  BookUploadNotFound,
  BookUploadsUnavailable,
} from "@goho/goho-api/book-uploads";
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
            create: (input, idempotencyKey) =>
              Effect.sync(() => {
                calls.push(["create", { ...input, bytes: [...input.bytes] }, idempotencyKey]);
                return bookUpload;
              }),
            delete: (uploadId) =>
              Effect.sync(() => {
                calls.push(["delete", uploadId]);
              }),
            get: (uploadId) =>
              Effect.sync(() => {
                calls.push(["get", uploadId]);
                return bookUpload;
              }),
            list: Effect.sync(() => {
              calls.push(["list"]);
              return [bookUpload];
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

const coverForm = (file: File, idempotencyKey?: string) => {
  const form = new FormData();
  if (idempotencyKey !== undefined) form.append("idempotencyKey", idempotencyKey);
  form.append("file", file);
  return form;
};

it.effect("uploads, lists, gets, and deletes cover scans through the generated client", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    const form = coverForm(
      new File([new Uint8Array([1, 2, 3])], "cover.webp", { type: "image/webp" }),
    );
    expect(yield* client.bookUploads.create({ payload: form })).toEqual({ data: bookUpload });
    const accepted = yield* HttpClient.post("/book-uploads", { body: HttpBody.formData(form) });
    expect(accepted.status).toBe(202);
    expect(yield* client.bookUploads.list()).toEqual({ data: [bookUpload] });
    expect(yield* client.bookUploads.get({ params: { uploadId: bookUpload.id } })).toEqual({
      data: bookUpload,
    });
    const deleted = yield* HttpClient.del(`/book-uploads/${bookUpload.id}`);
    expect(deleted.status).toBe(204);
    expect(yield* deleted.text).toBe("");
    const upload = { name: "cover.webp", contentType: "image/webp", bytes: [1, 2, 3] };
    expect(calls).toEqual([
      ["create", upload, undefined],
      ["create", upload, undefined],
      ["list"],
      ["get", bookUpload.id],
      ["delete", bookUpload.id],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("passes an idempotency key part to the service as the upload ID", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    const file = new File([new Uint8Array([1])], "cover.png", { type: "image/png" });
    expect(yield* client.bookUploads.create({ payload: coverForm(file, bookUpload.id) })).toEqual({
      data: bookUpload,
    });
    expect(calls).toEqual([
      ["create", { name: "cover.png", contentType: "image/png", bytes: [1] }, bookUpload.id],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("reports a deleted scan's key as gone", () => {
  const { layer } = testLayer({ create: () => Effect.fail(new BookUploadGone()) });
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    const file = new File([new Uint8Array([1])], "cover.png", { type: "image/png" });
    const error = yield* Effect.flip(
      client.bookUploads.create({ payload: coverForm(file, bookUpload.id) }),
    );
    expect(error._tag).toBe("BookUploadGone");
    const response = yield* HttpClient.post("/book-uploads", {
      body: HttpBody.formData(coverForm(file, bookUpload.id)),
    });
    expect(response.status).toBe(410);
  }).pipe(Effect.provide(layer));
});

it.effect("rejects unsupported and malformed cover uploads before the service", () => {
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
    const cover = new File([new Uint8Array([1])], "cover.png", { type: "image/png" });
    for (const [label, form] of [
      ["malformed key", coverForm(cover, "not-a-uuid")],
      ["version 1 key", coverForm(cover, "6ba7b810-9dad-11d1-80b4-00c04fd430c8")],
    ] as const) {
      const response = yield* HttpClient.post("/book-uploads", { body: HttpBody.formData(form) });
      expect(response.status, label).toBe(400);
    }
    // The parts limit is what makes servers from before the key, which allow
    // one part, reject a keyed upload rather than store it unprotected.
    const extraPart = coverForm(cover, bookUpload.id);
    extraPart.append("idempotencyKey", bookUpload.id);
    const tooManyParts = yield* HttpClient.post("/book-uploads", {
      body: HttpBody.formData(extraPart),
    });
    expect(tooManyParts.status).toBe(413);
    for (const request of [
      HttpClient.get("/book-uploads/not-a-uuid"),
      HttpClient.del("/book-uploads/not-a-uuid"),
    ]) {
      const response = yield* request;
      expect(response.status).toBe(400);
      expect(yield* response.text).toBe("");
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
        uploads: { get: () => Effect.fail(new BookUploadNotFound()) },
        request: HttpClient.get(`/book-uploads/${bookUpload.id}`),
        status: 404,
        tag: "BookUploadNotFound",
      },
      {
        uploads: { delete: () => Effect.fail(new BookUploadNotFound()) },
        request: HttpClient.del(`/book-uploads/${bookUpload.id}`),
        status: 404,
        tag: "BookUploadNotFound",
      },
      {
        uploads: { delete: () => Effect.fail(new BookUploadConflict()) },
        request: HttpClient.del(`/book-uploads/${bookUpload.id}`),
        status: 409,
        tag: "BookUploadConflict",
      },
      {
        uploads: { create: () => Effect.fail(new BookUploadsUnavailable()) },
        request: HttpClient.post("/book-uploads", { body: HttpBody.formData(form) }),
        status: 500,
        tag: "BookUploadsUnavailable",
      },
      {
        uploads: { list: Effect.fail(new BookUploadsUnavailable()) },
        request: HttpClient.get("/book-uploads"),
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
