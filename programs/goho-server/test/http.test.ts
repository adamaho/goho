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
          Effect.succeed([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]),
        importSheetsRaw: () =>
          Effect.succeed({
            apply: false,
            receiptCount: 1,
            sampleSourceIds: ["receipt-1"],
            imported: 0,
            skippedAlreadyPresent: 0,
            skippedInvalid: 0,
            rejects: [],
          }),
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
    expect(result).toEqual([{ _tag: "Processed", fileId: "receipt-1", fileName: "receipt.png" }]);
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

it.effect("round-trips a Sheets RAW dry-run through the generated client", () =>
  Effect.gen(function* () {
    const client = yield* Client.make("");
    const result = yield* client.receipts.importSheetsRaw({
      payload: { spreadsheetId: "sheet", worksheet: "RAW", apply: false },
    });
    expect(result).toEqual({
      apply: false,
      receiptCount: 1,
      sampleSourceIds: ["receipt-1"],
      imported: 0,
      skippedAlreadyPresent: 0,
      skippedInvalid: 0,
      rejects: [],
    });
  }).pipe(Effect.provide(TestLive)),
);

it.effect("rejects invalid Sheets RAW import inputs at the HTTP boundary", () =>
  Effect.gen(function* () {
    const body = yield* HttpBody.json({ spreadsheetId: "", worksheet: "RAW", apply: false });
    const response = yield* HttpClient.post("/receipts/import-sheets-raw", { body });
    expect(response.status).toBe(400);
  }).pipe(Effect.provide(TestLive)),
);
