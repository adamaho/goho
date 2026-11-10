import { layer } from "@effect/vitest";
import { ReceiptUploadsUnavailable } from "@goho/goho-server-client/receipt-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import {
  failedReceiptUpload,
  processingReceiptUpload,
  queuedReceiptUpload,
  succeededReceiptUpload,
} from "#test/fixtures/receipt-upload.ts";
import { apiAdvice, toolError, UploadListResult } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

// Newest first, as the API returns them.
const uploads = [
  queuedReceiptUpload,
  processingReceiptUpload,
  failedReceiptUpload,
  succeededReceiptUpload,
];

const respondWithUploads = (data: unknown) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");
    expect(request.url).toBe("/receipt-uploads");
    return HttpServerResponse.jsonUnsafe({ data });
  });

layer(McpFixture.layer(respondWithUploads(uploads)), McpFixture.moduleOptions)(
  "list_receipt_uploads",
  (it) => {
    it.effect("lists every receipt upload in API order, failed ones included, through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;

        const listed = yield* Schema.decodeUnknownEffect(UploadListResult)(
          yield* client.call(2, "list_receipt_uploads", {}),
        );
        expect(listed.isError).toBe(false);
        expect(listed.structuredContent).toEqual({ uploads });
        expect(yield* McpFixture.apiRequests).toEqual(["GET /receipt-uploads"]);
      }),
    );

    it.effect("lists no receipt uploads through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        yield* McpFixture.respondWith(respondWithUploads([]));

        const listed = yield* Schema.decodeUnknownEffect(UploadListResult)(
          yield* client.call(2, "list_receipt_uploads", {}),
        );
        expect(listed.isError).toBe(false);
        expect(listed.structuredContent).toEqual({ uploads: [] });
      }),
    );

    it.effect("reports failures and incompatible responses through MCP", () =>
      Effect.gen(function* () {
        const client = yield* McpFixture.openSession;
        const cases = [
          {
            routes: HttpServerRespondable.toResponse(new ReceiptUploadsUnavailable()),
            text: `Could not list receipt uploads. ${apiAdvice.serverFailed}`,
          },
          {
            routes: respondWithUploads([{ ...queuedReceiptUpload, status: "paused" }]),
            text: `Could not list receipt uploads. ${apiAdvice.incompatible}`,
          },
          {
            routes: respondWithUploads([{ ...queuedReceiptUpload, contentType: "image/gif" }]),
            text: `Could not list receipt uploads. ${apiAdvice.incompatible}`,
          },
        ];

        for (const [index, testCase] of cases.entries()) {
          yield* McpFixture.respondWith(testCase.routes);
          expect(yield* client.call(index + 2, "list_receipt_uploads", {})).toEqual(
            toolError(testCase.text),
          );
        }
      }),
    );
  },
);
