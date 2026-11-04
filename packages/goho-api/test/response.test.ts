import { Option, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ErrorCode, ErrorResponse } from "#src/response.ts";

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
});

describe("ErrorResponse", () => {
  it("constructs the public error envelope", () => {
    const response = { error: { code: "not_found", message: "Book 12 was not found." } } as const;
    expect(ErrorResponse.makeOption(response)).toEqual(Option.some(response));
  });

  it.each([
    { error: { code: "anything", message: "Nope" } },
    { error: { code: "not_found" } },
    { error: { code: "not_found", message: 12 } },
    { code: "not_found", message: "Nope" },
  ])("rejects an invalid public error: %j", (value) => {
    expect(Option.isNone(Schema.decodeUnknownOption(ErrorResponse)(value))).toBe(true);
  });
});
