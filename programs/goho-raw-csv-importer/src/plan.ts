import { CalendarDate, type DecimalString } from "@goho/goho-api/receipts";
import { Array, type BigDecimal, Result, Schema } from "effect";

import { type MalformedCsv, parseRecords, type SourceRecord, type SourceRef } from "./csv.ts";
import { calculateTotals, formatDecimal, parsePrice } from "./money.ts";

/**
 * Required RAW export header, in column order.
 *
 * @category models
 * @since 0.1.0
 */
export const HEADER = ["store", "date", "category", "item", "price", "source_file_id"] as const;

/**
 * Every imported receipt uses this currency; amounts are not converted.
 *
 * @category models
 * @since 0.1.0
 */
export const CURRENCY = "CAD";

/**
 * Historical purchase date in YYYY-MM-DD form.
 *
 * @category models
 * @since 0.1.0
 */
export type PurchaseDate = typeof CalendarDate.Type;

/**
 * One record problem. Any error blocks apply.
 *
 * @category models
 * @since 0.1.0
 */
export interface RecordError {
  readonly ref: SourceRef;
  readonly message: string;
}

/**
 * A valid negative-price record that was reported and left out of the import.
 *
 * @category models
 * @since 0.1.0
 */
export interface SkippedRecord {
  readonly ref: SourceRef;
  readonly store: string;
  readonly receiptDate: PurchaseDate;
  readonly item: string;
  readonly price: DecimalString;
}

/**
 * One retained item, in original CSV order within its receipt.
 *
 * @category models
 * @since 0.1.0
 */
export interface PlannedItem {
  readonly ref: SourceRef;
  readonly name: string;
  readonly amount: DecimalString;
}

/**
 * One receipt to insert, merged from every retained record with the same
 * normalized store and purchase date.
 *
 * @category models
 * @since 0.1.0
 */
export interface PlannedReceipt {
  readonly storeName: string;
  readonly receiptDate: PurchaseDate;
  readonly category: string;
  readonly currency: typeof CURRENCY;
  readonly subtotal: DecimalString;
  readonly tax: DecimalString;
  readonly total: DecimalString;
  readonly items: Array.NonEmptyReadonlyArray<PlannedItem>;
}

/**
 * Validated receipts plus everything that was skipped or invalid. The plan is
 * importable only when `errors` is empty.
 *
 * @category models
 * @since 0.1.0
 */
export interface ImportPlan {
  readonly receipts: ReadonlyArray<PlannedReceipt>;
  readonly skipped: ReadonlyArray<SkippedRecord>;
  readonly errors: ReadonlyArray<RecordError>;
  readonly dataRecords: number;
  readonly blankRecords: number;
}

/**
 * Header problems mean no column can be interpreted.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidHeader extends Schema.TaggedError<InvalidHeader>()(
  "RawCsvImporter.InvalidHeader",
  { message: Schema.String },
) {}

interface ValidRecord {
  readonly ref: SourceRef;
  readonly store: string;
  readonly receiptDate: PurchaseDate;
  readonly category: string;
  readonly item: string;
  readonly price: BigDecimal.BigDecimal;
}

interface Group {
  readonly first: ValidRecord;
  readonly rest: Array<ValidRecord>;
}

const isCalendarDate = Schema.is(CalendarDate);
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;

const isBlank = (fields: ReadonlyArray<string>) => fields.every((field) => field.trim() === "");

const cleanStore = (store: string) => store.trim().replace(/\s+/gu, " ");

const pad = (value: number, length: number) => String(value).padStart(length, "0");

/**
 * Accepts YYYY-MM-DD or a whole Google Sheets serial day (epoch 1899-12-30).
 * Slash dates are rejected because their day/month order cannot be known.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parsePurchaseDate = (text: string): Result.Result<PurchaseDate, string> => {
  const value = text.trim();
  if (value === "") return Result.fail("date is required");
  if (value.includes("/")) {
    return Result.fail(`date ${JSON.stringify(text)} is ambiguous; use YYYY-MM-DD`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return isCalendarDate(value)
      ? Result.succeed(value)
      : Result.fail(`date ${JSON.stringify(text)} is not a real calendar date`);
  }
  if (/^\d{1,7}$/u.test(value)) {
    const date = new Date(SHEETS_EPOCH_UTC + Number(value) * MILLISECONDS_PER_DAY);
    const formatted = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
    return isCalendarDate(formatted)
      ? Result.succeed(formatted)
      : Result.fail(`date serial ${value} is outside the supported calendar range`);
  }
  return Result.fail(
    `date ${JSON.stringify(text)} must be YYYY-MM-DD or a whole Google Sheets date number`,
  );
};

const requireText = (field: string, value: string): Result.Result<string, string> =>
  value.trim() === "" ? Result.fail(`${field} is required`) : Result.succeed(value.trim());

const validateRecord = (
  ref: SourceRef,
  fields: ReadonlyArray<string>,
): Result.Result<ValidRecord, ReadonlyArray<string>> => {
  if (fields.length !== HEADER.length) {
    return Result.fail([`expected ${HEADER.length} fields but found ${fields.length}`]);
  }
  // source_file_id is accepted but ignored.
  const [store = "", date = "", category = "", item = "", price = ""] = fields;
  const parsed = {
    store: requireText("store", store).pipe(Result.map(cleanStore)),
    receiptDate: parsePurchaseDate(date),
    category: requireText("category", category),
    item: requireText("item", item),
    price: parsePrice(price),
  };
  return Result.all(parsed).pipe(
    Result.map((values) => ({ ref, ...values })),
    Result.mapError(() =>
      Object.values(parsed).flatMap((result: Result.Result<unknown, string>) =>
        Result.isFailure(result) ? [result.failure] : [],
      ),
    ),
  );
};

/** Most retained rows wins; ties go to the category whose first row came earliest. */
const chooseCategory = (records: Array.NonEmptyReadonlyArray<ValidRecord>) => {
  const counts = new Map<string, number>();
  for (const { category } of records) counts.set(category, (counts.get(category) ?? 0) + 1);
  let chosen = records[0].category;
  // Map iteration follows first insertion, so a strict comparison keeps the earliest tie.
  for (const [category, count] of counts) {
    if (count > (counts.get(chosen) ?? 0)) chosen = category;
  }
  return chosen;
};

const toReceipt = ({ first, rest }: Group): PlannedReceipt => {
  const records: Array.NonEmptyReadonlyArray<ValidRecord> = [first, ...rest];
  return {
    storeName: first.store,
    receiptDate: first.receiptDate,
    category: chooseCategory(records),
    currency: CURRENCY,
    ...calculateTotals(records.map((record) => record.price)),
    items: Array.map(records, (record) => ({
      ref: record.ref,
      name: record.item,
      amount: formatDecimal(record.price),
    })),
  };
};

const checkHeader = (
  records: ReadonlyArray<SourceRecord>,
): Result.Result<ReadonlyArray<SourceRecord>, InvalidHeader> => {
  const expected = HEADER.join(",");
  const header = records[0];
  if (header === undefined) {
    return Result.fail(new InvalidHeader({ message: `CSV is empty; expected header ${expected}` }));
  }
  const actual = header.fields.map((field) => field.trim());
  // Compare field by field: a single quoted field containing commas is not six columns.
  if (actual.length !== HEADER.length) {
    return Result.fail(
      new InvalidHeader({
        message: `CSV header must have ${HEADER.length} fields (${expected}) but had ${actual.length}: ${JSON.stringify(actual)}`,
      }),
    );
  }
  return actual.every((field, index) => field === HEADER[index])
    ? Result.succeed(records.slice(1))
    : Result.fail(
        new InvalidHeader({
          message: `CSV header must be ${expected} but was ${actual.join(",")}`,
        }),
      );
};

const buildPlan = (records: ReadonlyArray<SourceRecord>): ImportPlan => {
  const errors: Array<RecordError> = [];
  const skipped: Array<SkippedRecord> = [];
  const groups = new Map<string, Group>();
  let blankRecords = 0;

  for (const { fields, ...ref } of records) {
    if (isBlank(fields)) {
      blankRecords += 1;
      continue;
    }
    const validated = validateRecord(ref, fields);
    if (Result.isFailure(validated)) {
      for (const message of validated.failure) errors.push({ ref, message });
      continue;
    }
    const record = validated.success;
    if (record.price.value < 0n) {
      const { store, receiptDate, item } = record;
      skipped.push({ ref, store, receiptDate, item, price: formatDecimal(record.price) });
      continue;
    }
    // Stores match across spelling case and whitespace; the first retained spelling is shown.
    const key = JSON.stringify([record.store.toLowerCase(), record.receiptDate]);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { first: record, rest: [] });
    else group.rest.push(record);
  }

  return {
    receipts: [...groups.values()].map(toReceipt),
    skipped,
    errors,
    dataRecords: records.length,
    blankRecords,
  };
};

/**
 * Parses and validates RAW CSV text into receipt plans without any IO.
 * Negative prices are reported in `skipped` and excluded from amounts and
 * category votes; record errors are collected across every parseable record.
 *
 * @category planning
 * @since 0.1.0
 */
export const planImport = (text: string): Result.Result<ImportPlan, MalformedCsv | InvalidHeader> =>
  parseRecords(text).pipe(Result.flatMap(checkHeader), Result.map(buildPlan));
