import { Option, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { DeletedResource, DeleteResult } from "#src/response.ts";

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
