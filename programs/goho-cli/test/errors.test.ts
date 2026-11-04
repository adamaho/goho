import { Option, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { CommandError, ErrorCode, getRequestErrorCode } from "#src/errors.ts";

describe("ErrorCode", () => {
  it("restricts categories to the public literal union", () => {
    expectTypeOf<ErrorCode>().toEqualTypeOf<
      | "invalid_input"
      | "not_found"
      | "conflict"
      | "request_failed"
      | "file_error"
      | "configuration_error"
    >();
    expect(Option.isNone(Schema.decodeUnknownOption(ErrorCode)("anything"))).toBe(true);
  });

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
  it.each([
    ["BadRequest", "invalid_input"],
    ["NotFound", "not_found"],
    ["BookNotFound", "not_found"],
    ["BookImageNotFound", "not_found"],
    ["BookUploadNotFound", "not_found"],
    ["Conflict", "conflict"],
    ["BookConflict", "conflict"],
    ["BookUploadConflict", "conflict"],
    ["BooksUnavailable", "request_failed"],
    ["InternalServerError", "request_failed"],
    ["HttpClientError", "request_failed"],
    ["SchemaError", "request_failed"],
  ])("maps %s to %s", (tag, code) => {
    expect(getRequestErrorCode({ _tag: tag })).toBe(code);
  });
});
