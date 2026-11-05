import { describe, expect, it } from "vitest";

import { CommandError, getRequestErrorCode } from "#src/errors.ts";

describe("CommandError", () => {
  it.each([
    "invalid_input",
    "not_found",
    "conflict",
    "request_failed",
    "file_error",
    "configuration_error",
  ] as const)("accepts %s on a command error", (code) => {
    const cause = new Error("internal diagnostic");
    const error = new CommandError({ code, message: "Safe message", cause });
    expect(error.code).toBe(code);
    expect(error.message).toBe("Safe message");
    expect(error.cause).toBe(cause);
  });
});

describe("getRequestErrorCode", () => {
  it("preserves the code from a decoded public error envelope", () => {
    expect(
      getRequestErrorCode({ error: { code: "invalid_input", message: "Upload limit exceeded." } }),
    ).toBe("invalid_input");
  });
  it.each([
    ["BadRequestProblem", "invalid_input"],
    ["ReceiptNotFound", "not_found"],
    ["ReceiptItemNotFound", "not_found"],
    ["ReceiptImageNotFound", "not_found"],
    ["ReceiptUploadNotFound", "not_found"],
    ["BookNotFound", "not_found"],
    ["BookImageNotFound", "not_found"],
    ["BookUploadNotFound", "not_found"],
    ["ReceiptUploadConflict", "conflict"],
    ["BookConflict", "conflict"],
    ["BookUploadConflict", "conflict"],
    ["BooksUnavailable", "request_failed"],
    ["ReceiptsUnavailable", "request_failed"],
    ["ReceiptUploadsUnavailable", "request_failed"],
    ["HttpClientError", "request_failed"],
    ["SchemaError", "request_failed"],
  ])("maps %s to %s", (tag, code) => {
    expect(getRequestErrorCode({ _tag: tag })).toBe(code);
  });
});
