import { Option, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { DeletedResource, DeleteResult, ErrorResponse } from "#src/response.ts";

describe("DeleteResult", () => {
  it("restricts resource names to the supported literal union", () => {
    expectTypeOf<DeletedResource>().toEqualTypeOf<
      "book" | "receipt" | "book-upload" | "receipt-upload"
    >();
  });

  it.each([
    { resource: "book", id: "9007199254740993" },
    { resource: "receipt", id: "42" },
    { resource: "book-upload", id: "00000000-0000-4000-8000-000000000001" },
    { resource: "receipt-upload", id: "00000000-0000-4000-8000-000000000002" },
  ] satisfies ReadonlyArray<{ resource: DeletedResource; id: string }>)(
    "constructs a $resource confirmation without changing the ID",
    ({ resource, id }) => {
      const result = DeleteResult.makeOption({ deleted: true, resource, id });
      expect(result).toEqual(Option.some({ deleted: true, resource, id }));
    },
  );

  it.each([
    { deleted: true, resource: "other", id: "12" },
    { deleted: false, resource: "book", id: "12" },
    { deleted: true, resource: "book", id: 12 },
  ])("rejects an invalid confirmation: %j", (value) => {
    expect(Option.isNone(Schema.decodeUnknownOption(DeleteResult)(value))).toBe(true);
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
