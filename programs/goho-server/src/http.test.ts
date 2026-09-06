import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer, Redacted } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { expect } from "vitest";

import * as Http from "./http.ts";
import * as Receipts from "./receipts/service.ts";

const TestLive = HttpRouter.serve(
  Http.layer.pipe(
    Layer.provide([
      Http.layerAuthorization(Redacted.make("test-token")),
      Layer.succeed(Receipts.Service, {
        process: () =>
          Effect.succeed([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]),
      }),
    ]),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("round-trips receipt results through the generated client", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("", Redacted.make("test-token"));
    const result = yield* client.receipts.process({
      payload: { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 5 },
    });
    expect(result).toEqual([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rejects missing and incorrect bearer tokens before processing", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json({
      rootFolderId: "root",
      spreadsheetId: "sheet",
      concurrency: 1,
    });
    const missing = yield* HttpClient.post("/receipts/process", { body });
    const wrong = yield* HttpClient.post("/receipts/process", {
      body,
      headers: { authorization: "Bearer wrong" },
    });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rejects invalid request inputs at the HTTP boundary", () =>
  Effect.gen(function* () {
    for (const payload of [
      { rootFolderId: "", spreadsheetId: "sheet", concurrency: 1 },
      { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 6 },
      { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 1.5 },
    ]) {
      const body = yield* HttpBody.json(payload);
      const response = yield* HttpClient.post("/receipts/process", {
        body,
        headers: { authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(400);
    }
  }).pipe(Effect.provide(TestLive)),
);
