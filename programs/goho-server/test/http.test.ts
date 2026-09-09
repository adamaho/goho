import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { expect } from "vitest";

import * as Http from "../src/http.ts";
import * as Receipts from "../src/receipts/service.ts";

const TestLive = HttpRouter.serve(
  Http.layer.pipe(
    Layer.provide([
      Layer.succeed(Receipts.Service, {
        process: () =>
          Effect.succeed([
            { _tag: "@goho/Processed", fileId: "receipt-1", fileName: "receipt.png" },
          ]),
      }),
    ]),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("round-trips receipt results through the generated client without authentication", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const result = yield* client.receipts.process({
      payload: { rootFolderId: "root", spreadsheetId: "sheet", concurrency: 5 },
    });
    expect(result).toEqual([
      { _tag: "@goho/Processed", fileId: "receipt-1", fileName: "receipt.png" },
    ]);
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
      });
      expect(response.status).toBe(400);
    }
  }).pipe(Effect.provide(TestLive)),
);
