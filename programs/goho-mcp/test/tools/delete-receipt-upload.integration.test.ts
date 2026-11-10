import { layer } from "@effect/vitest";
import {
  ReceiptUploadConflict,
  ReceiptUploadNotFound,
  ReceiptUploadsUnavailable,
} from "@goho/goho-server-client/receipt-uploads";
import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/http";
import { expect } from "vitest";

import { failedReceiptUpload, succeededReceiptUpload } from "#test/fixtures/receipt-upload.ts";
import { apiAdvice, DeleteUploadResult, ErrorResult, toolError } from "#test/support/mcp-client.ts";
import * as McpFixture from "#test/support/mcp-fixture.ts";

const missingId = "11111111-2222-4333-8444-555555555555";
const unavailableId = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const routes = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  expect(request.method).toBe("DELETE");

  switch (request.url) {
    case `/receipt-uploads/${failedReceiptUpload.id}`:
      return HttpServerResponse.empty({ status: 204 });
    case `/receipt-uploads/${succeededReceiptUpload.id}`:
      return yield* HttpServerRespondable.toResponse(new ReceiptUploadConflict());
    case `/receipt-uploads/${missingId}`:
      return yield* HttpServerRespondable.toResponse(new ReceiptUploadNotFound());
    default:
      return yield* HttpServerRespondable.toResponse(new ReceiptUploadsUnavailable());
  }
});

layer(McpFixture.layer(routes), McpFixture.moduleOptions)("delete_receipt_upload", (it) => {
  it.effect("deletes a failed receipt upload by its exact ID through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      const deleted = yield* Schema.decodeUnknownEffect(DeleteUploadResult)(
        yield* client.call(2, "delete_receipt_upload", { upload_id: failedReceiptUpload.id }),
      );
      expect(deleted.isError).toBe(false);
      expect(deleted.structuredContent).toEqual({ deleted_upload_id: failedReceiptUpload.id });
      expect(yield* McpFixture.apiRequests).toEqual([
        `DELETE /receipt-uploads/${failedReceiptUpload.id}`,
      ]);
    }),
  );

  it.effect("leaves the failed-only rule to the API and reports its conflict through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(
        yield* client.call(2, "delete_receipt_upload", { upload_id: succeededReceiptUpload.id }),
      ).toEqual(toolError("Only failed receipt uploads can be deleted. Nothing changed."));
      // No status lookup first: the API's answer is the authority.
      expect(yield* McpFixture.apiRequests).toEqual([
        `DELETE /receipt-uploads/${succeededReceiptUpload.id}`,
      ]);
    }),
  );

  it.effect("reports missing uploads and failures when deleting through MCP", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;

      expect(yield* client.call(2, "delete_receipt_upload", { upload_id: missingId })).toEqual(
        toolError(`Receipt upload ${missingId} was not found.`),
      );
      expect(yield* client.call(3, "delete_receipt_upload", { upload_id: unavailableId })).toEqual(
        toolError(`Could not delete receipt upload. ${apiAdvice.serverFailed}`),
      );
      yield* McpFixture.respondWith(McpFixture.dropConnections);
      expect(
        yield* client.call(4, "delete_receipt_upload", { upload_id: failedReceiptUpload.id }),
      ).toEqual(toolError(`Could not delete receipt upload. ${apiAdvice.unreachable}`));
    }),
  );

  it.effect("rejects invalid upload IDs without calling the API", () =>
    Effect.gen(function* () {
      const client = yield* McpFixture.openSession;
      // A version 1 UUID, a receipt ID, a number, and no ID at all.
      const invalidInputs = [
        { upload_id: "2a3b4c5d-6e7f-1a8b-9c0d-e1f2a3b4c5d6" },
        { upload_id: "42" },
        { upload_id: 42 },
        {},
      ];

      for (const [index, input] of invalidInputs.entries()) {
        const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
          yield* client.call(index + 2, "delete_receipt_upload", input),
        );
        expect(invalid.isError).toBe(true);
        expect(invalid.content[0]?.text).toMatch(
          /^Invalid parameters for tool 'delete_receipt_upload': /,
        );
      }
      expect(yield* McpFixture.apiRequests).toEqual([]);
    }),
  );
});
