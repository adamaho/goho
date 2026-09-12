import { GoogleSheets } from "@goho/core";
import type {
  ImportSheetsRawRequest,
  ImportSheetsRawResult,
} from "@goho/goho-server-client/receipts";
import { Array, BigDecimal, Effect, Option, Schema } from "effect";

import {
  CalendarDate,
  DecimalString,
  type ImportedSheetsPayload,
  type ReceiptToSave,
} from "./model.ts";
import * as ReceiptRepository from "./repository.ts";

const SAMPLE_SOURCE_IDS = 10;
const HEADER_CELLS = ["store", "date", "category", "item", "price", "source_file_id"] as const;

/**
 * One RAW row that cannot be imported without inventing data.
 *
 * @category models
 * @since 0.1.0
 */
export interface RejectedRow {
  readonly row: number;
  readonly reason: string;
}

/**
 * Mapped receipts plus the reject list for a RAW worksheet.
 *
 * @category models
 * @since 0.1.0
 */
export interface MappedImport {
  readonly receipts: ReadonlyArray<ReceiptToSave>;
  readonly rejects: ReadonlyArray<RejectedRow>;
}

interface ValidRawRow {
  readonly row: number;
  readonly store: string;
  readonly date: string;
  readonly category: string;
  readonly item: string;
  readonly price: number;
  readonly sourceFileId: string | undefined;
}

interface ReceiptItem {
  readonly name: string;
  readonly price: number;
}

interface ReceiptGroup {
  readonly source: ReceiptToSave["source"];
  readonly storeName: string;
  readonly receiptDate: string;
  readonly category: string;
  readonly items: [ReceiptItem, ...Array<ReceiptItem>];
}

const TAX_RATE = BigDecimal.make(113n, 2);

const NonEmptyText = Schema.Trim.check(Schema.isNonEmpty());
const BlankText = Schema.String.check(
  Schema.makeFilter((value) => value.trim() === "", {
    expected: "a blank cell",
  }),
);
const PriceFromCell = Schema.Union([
  Schema.Finite,
  NonEmptyText.pipe(Schema.decodeTo(Schema.FiniteFromString)),
]);
const NonNegativeFinite = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

const decodeName = Schema.decodeUnknownOption(NonEmptyText);
const decodeBlankText = Schema.decodeUnknownOption(BlankText);
const decodePrice = Schema.decodeUnknownOption(PriceFromCell);
const decodeCalendarDate = Schema.decodeUnknownOption(CalendarDate);
const decodeNonNegativeFinite = Schema.decodeUnknownOption(NonNegativeFinite);

const isBlankCell = (value: GoogleSheets.CellValue | undefined): boolean =>
  value === undefined || Option.isSome(decodeBlankText(value));

const isEmptyRow = (row: GoogleSheets.Row): boolean =>
  [0, 1, 2, 3, 4, 5].every((index) => isBlankCell(row.at(index)));

const isHeaderRow = (row: GoogleSheets.Row): boolean =>
  HEADER_CELLS.every((header, index) => {
    const text = decodeName(row.at(index));
    return Option.isSome(text) && text.value.toLowerCase() === header;
  });

const parseName = (value: GoogleSheets.CellValue | undefined): string | undefined =>
  Option.getOrUndefined(decodeName(value));

const parsePrice = (value: GoogleSheets.CellValue | undefined): number | undefined =>
  Option.getOrUndefined(decodePrice(value));

const formatIsoDate = (date: Date): string => {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseSheetsSerialDate = (serial: number): string | undefined => {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86_400_000);
  return Option.getOrUndefined(decodeCalendarDate(formatIsoDate(date)));
};

const parseDate = (value: GoogleSheets.CellValue | undefined): string | undefined => {
  const iso = decodeCalendarDate(value);
  if (Option.isSome(iso)) {
    return iso.value;
  }
  const serial = decodeNonNegativeFinite(value);
  if (Option.isSome(serial)) {
    return parseSheetsSerialDate(serial.value);
  }
  return undefined;
};

const parseSourceFileId = (
  value: GoogleSheets.CellValue | undefined,
): { readonly ok: true; readonly id: string | undefined } | { readonly ok: false } => {
  const id = decodeName(value);
  if (Option.isSome(id)) {
    return { ok: true, id: id.value };
  }
  if (isBlankCell(value)) {
    return { ok: true, id: undefined };
  }
  return { ok: false };
};

const normalizeStore = (store: string): string => store.trim().replace(/\s+/g, " ");

const importTaxTotals = (prices: ReadonlyArray<number>) => {
  const subtotal = BigDecimal.sumAll(Array.map(prices, BigDecimal.fromNumberUnsafe));
  const total = BigDecimal.round(BigDecimal.multiply(subtotal, TAX_RATE), {
    mode: "half-from-zero",
    scale: 2,
  });
  const tax = BigDecimal.subtract(total, subtotal);
  return {
    subtotal: DecimalString.make(BigDecimal.format(subtotal)),
    tax: DecimalString.make(BigDecimal.format(tax)),
    total: DecimalString.make(BigDecimal.format(total)),
  };
};

const worksheetRange = (worksheet: string): string => {
  if (/^[A-Za-z0-9_]+$/.test(worksheet)) {
    return `${worksheet}!A:F`;
  }
  return `'${worksheet.replaceAll("'", "''")}'!A:F`;
};

const reject = (row: number, field: string): RejectedRow => ({
  row,
  reason: `invalid ${field}`,
});

const parseRow = (rowNumber: number, row: GoogleSheets.Row): ValidRawRow | RejectedRow => {
  const store = parseName(row.at(0));
  if (store === undefined) {
    return reject(rowNumber, "store");
  }
  const date = parseDate(row.at(1));
  if (date === undefined) {
    return reject(rowNumber, "date");
  }
  const category = parseName(row.at(2));
  if (category === undefined) {
    return reject(rowNumber, "category");
  }
  const item = parseName(row.at(3));
  if (item === undefined) {
    return reject(rowNumber, "item");
  }
  const price = parsePrice(row.at(4));
  if (price === undefined) {
    return reject(rowNumber, "price");
  }
  const sourceFileId = parseSourceFileId(row.at(5));
  if (!sourceFileId.ok) {
    return reject(rowNumber, "source_file_id");
  }
  return { row: rowNumber, store, date, category, item, price, sourceFileId: sourceFileId.id };
};

const groupKey = (row: ValidRawRow, spreadsheetId: string): string => {
  if (row.sourceFileId !== undefined) {
    return `google_drive:${row.sourceFileId}`;
  }
  return `google_sheets:${spreadsheetId}:${normalizeStore(row.store)}:${row.date}`;
};

const toReceipt = (group: ReceiptGroup): ReceiptToSave => {
  const totals = importTaxTotals(Array.map(group.items, (item) => item.price));
  const extractedPayload = {
    importedFrom: "google_sheets_raw",
    store: { name: group.storeName },
    date: group.receiptDate,
    transaction: {
      items: Array.map(group.items, (item) => ({ name: item.name, price: item.price })),
      category: group.category,
      subtotal: Number(totals.subtotal),
      tax: Number(totals.tax),
      total: Number(totals.total),
    },
  } satisfies ImportedSheetsPayload;
  return {
    source: group.source,
    storeName: group.storeName,
    receiptDate: group.receiptDate,
    category: group.category,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    currency: null,
    extractionVersion: 1,
    extractedPayload,
    items: Array.map(group.items, (item, position) => ({
      position,
      name: item.name,
      amount: DecimalString.make(String(item.price)),
    })),
  };
};

/**
 * Groups valid RAW rows and lists rejects without inventing missing values.
 *
 * @category models
 * @since 0.1.0
 */
export const mapRawRows = (
  spreadsheetId: string,
  rows: ReadonlyArray<GoogleSheets.Row>,
): MappedImport => {
  const rejects: Array<RejectedRow> = [];
  const groups = new Map<string, ReceiptGroup>();
  const startIndex = rows[0] !== undefined && isHeaderRow(rows[0]) ? 1 : 0;

  for (const [offset, row] of rows.slice(startIndex).entries()) {
    if (isEmptyRow(row)) {
      continue;
    }
    const parsed = parseRow(offset + startIndex + 1, row);
    if ("reason" in parsed) {
      rejects.push(parsed);
      continue;
    }
    const key = groupKey(parsed, spreadsheetId);
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.items.push({ name: parsed.item, price: parsed.price });
      continue;
    }
    const sourceFileId = parsed.sourceFileId;
    const source =
      sourceFileId === undefined
        ? {
            provider: "google_sheets" as const,
            fileId: `sheet:${spreadsheetId}:${normalizeStore(parsed.store)}:${parsed.date}`,
            fileName: `sheet:${spreadsheetId}:${normalizeStore(parsed.store)}:${parsed.date}`,
          }
        : {
            provider: "google_drive" as const,
            fileId: sourceFileId,
            fileName: sourceFileId,
          };
    groups.set(key, {
      source,
      storeName: parsed.store,
      receiptDate: parsed.date,
      category: parsed.category,
      items: [{ name: parsed.item, price: parsed.price }],
    });
  }

  return {
    receipts: [...groups.values()].map(toReceipt),
    rejects,
  };
};

const summarize = (
  apply: boolean,
  mapped: MappedImport,
  imported: number,
  skippedAlreadyPresent: number,
): ImportSheetsRawResult => ({
  apply,
  receiptCount: mapped.receipts.length,
  sampleSourceIds: mapped.receipts
    .slice(0, SAMPLE_SOURCE_IDS)
    .map((receipt) => receipt.source.fileId),
  imported,
  skippedAlreadyPresent,
  skippedInvalid: mapped.rejects.length,
  rejects: mapped.rejects,
});

/**
 * Reads RAW rows, maps them, and optionally persists through the receipt repository.
 *
 * @category models
 * @since 0.1.0
 */
export const run = Effect.fn("@goho/ImportSheetsRaw.run")(function* (
  request: ImportSheetsRawRequest,
) {
  const sheets = yield* GoogleSheets.Service;
  const rows = yield* sheets.readRows({
    spreadsheetId: request.spreadsheetId,
    range: worksheetRange(request.worksheet),
  });
  const mapped = mapRawRows(request.spreadsheetId, rows);
  if (!request.apply) {
    return summarize(false, mapped, 0, 0);
  }

  const repository = yield* ReceiptRepository.Service;
  const results = yield* Effect.forEach(mapped.receipts, (receipt) => repository.save(receipt), {
    concurrency: 1,
  });
  let imported = 0;
  let skippedAlreadyPresent = 0;
  for (const result of results) {
    if (result._tag === "Inserted") {
      imported += 1;
    } else {
      skippedAlreadyPresent += 1;
    }
  }
  return summarize(true, mapped, imported, skippedAlreadyPresent);
});
