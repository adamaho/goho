import { layer } from "@effect/vitest";
import {
  ReceiptUploadNotFound,
  ReceiptUploadsUnavailable,
} from "@goho/goho-server-client/receipt-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import {
  failedReceiptUpload,
  processingReceiptUpload,
  queuedReceiptUpload,
  succeededReceiptUpload,
} from "#test/fixtures/receipt-upload.ts";
import { apiAdvice, ErrorResult, toolError, UploadResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const uploads = [
  queuedReceiptUpload,
  processingReceiptUpload,
  succeededReceiptUpload,
  failedReceiptUpload,
];
const missingId = "11111111-2222-4333-8444-555555555555";
const unavailableId = "66666666-7777-4888-9999-aaaaaaaaaaaa";
// Receipt IDs are strings, so a number would be rounded above 2^53.
const numericReceiptId = {
  ...succeededReceiptUpload,
  id: "bbbbbbbb-cccc-4ddd-aeee-ffffffffffff",
  receiptId: 42,
};
// A recipe upload failure code, which no receipt upload has.
const unknownFailureCode = {
  ...failedReceiptUpload,
  id: "cccccccc-dddd-4eee-afff-000000000000",
  failureCode: "page_unavailable",
};

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("GET");

  const upload = [...uploads, numericReceiptId, unknownFailureCode].find(
    ({ id }) => request.url === `/receipt-uploads/${id}`,
  );
  if (upload !== undefined) {
    return HttpServerResponse.jsonUnsafe({ data: upload });
  }
  if (request.url === `/receipt-uploads/${missingId}`) {
    return yield* HttpServerRespondable.toResponse(new ReceiptUploadNotFound());
  }
  return yield* HttpServerRespondable.toResponse(new ReceiptUploadsUnavailable());
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("get_receipt_upload", (it) => {
  it.effect("gets a receipt upload in each status as a successful result through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      for (const [index, upload] of uploads.entries()) {
        const found = yield* Schema.decodeUnknownEffect(UploadResult)(
          yield* client.call(index + 2, "get_receipt_upload", { upload_id: upload.id }),
        );
        // A failed upload is still a successful lookup.
        expect(found.isError, upload.status).toBe(false);
        expect(found.structuredContent).toEqual({ upload });
      }
      expect(yield* McpFixture.apiRequests).toEqual(
        uploads.map(({ id }) => `GET /receipt-uploads/${id}`),
      );
    }),
  );

  it.effect(
    "reports missing uploads, server failures, and incompatible responses through MCP",
    () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          { upload_id: missingId, text: `Receipt upload ${missingId} was not found.` },
          {
            upload_id: unavailableId,
            text: `Could not get receipt upload. ${apiAdvice.serverFailed}`,
          },
          {
            upload_id: numericReceiptId.id,
            text: `Could not get receipt upload. ${apiAdvice.incompatible}`,
          },
          {
            upload_id: unknownFailureCode.id,
            text: `Could not get receipt upload. ${apiAdvice.incompatible}`,
          },
        ];

        for (const [index, { upload_id, text }] of cases.entries()) {
          expect(yield* client.call(index + 2, "get_receipt_upload", { upload_id })).toEqual(
            toolError(text),
          );
        }
        yield* McpFixture.respondWith(McpFixture.dropConnections);
        expect(
          yield* client.call(9, "get_receipt_upload", { upload_id: queuedReceiptUpload.id }),
        ).toEqual(toolError(`Could not get receipt upload. ${apiAdvice.unreachable}`));
      }),
  );

  it.effect("rejects invalid upload IDs without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // A version 1 UUID, a receipt ID, a number, and no ID at all.
      const invalidInputs = [
        { upload_id: "5d2c8e1a-3b4f-1c6d-9e7f-8a0b1c2d3e4f" },
        { upload_id: "42" },
        { upload_id: 42 },
        {},
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "get_receipt_upload", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'get_receipt_upload': /,
        );
        expect(invalid.content[0]?.text).toContain("upload_id");
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
