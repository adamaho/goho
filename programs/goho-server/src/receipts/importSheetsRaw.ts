import { GoogleSheets } from "@goho/core";
import type {
  ImportSheetsRawRequest,
  ImportSheetsRawResult,
} from "@goho/goho-server-client/receipts";
import { Effect } from "effect";

import { DecimalString, type ImportedSheetsPayload, type ReceiptToSave } from "./model.ts";
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

interface Decimal {
  readonly negative: boolean;
  readonly coefficient: bigint;
  readonly scale: number;
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

const zero: Decimal = { negative: false, coefficient: 0n, scale: 0 };
const TAX_RATE: Decimal = { negative: false, coefficient: 113n, scale: 2 };

const isString = (value: unknown): value is string => typeof value === "string";

const isBlankCell = (value: GoogleSheets.CellValue | undefined): boolean =>
  value === undefined || (isString(value) && value.trim() === "");

const isEmptyRow = (row: GoogleSheets.Row): boolean =>
  [0, 1, 2, 3, 4, 5].every((index) => isBlankCell(row.at(index)));

const isHeaderRow = (row: GoogleSheets.Row): boolean =>
  HEADER_CELLS.every((header, index) => {
    const value = row.at(index);
    return isString(value) && value.trim().toLowerCase() === header;
  });

const parseName = (value: GoogleSheets.CellValue | undefined): string | undefined => {
  if (!isString(value)) {
    return undefined;
  }
  const name = value.trim();
  return name.length > 0 ? name : undefined;
};

const parsePrice = (value: GoogleSheets.CellValue | undefined): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!isString(value)) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "" || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    return undefined;
  }
  const price = Number(trimmed);
  return Number.isFinite(price) ? price : undefined;
};

const isCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const formatIsoDate = (date: Date): string => {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseSheetsSerialDate = (serial: number): string | undefined => {
  if (!Number.isFinite(serial) || serial < 0) {
    return undefined;
  }
  const whole = Math.trunc(serial);
  const date = new Date(Date.UTC(1899, 11, 30) + whole * 86_400_000);
  const iso = formatIsoDate(date);
  return isCalendarDate(iso) ? iso : undefined;
};

const parseDate = (value: GoogleSheets.CellValue | undefined): string | undefined => {
  if (typeof value === "number") {
    return parseSheetsSerialDate(value);
  }
  if (!isString(value)) {
    return undefined;
  }
  const date = value.trim();
  return isCalendarDate(date) ? date : undefined;
};

const parseSourceFileId = (
  value: GoogleSheets.CellValue | undefined,
): { readonly ok: true; readonly id: string | undefined } | { readonly ok: false } => {
  if (isBlankCell(value)) {
    return { ok: true, id: undefined };
  }
  if (!isString(value)) {
    return { ok: false };
  }
  const id = value.trim();
  return id.length > 0 ? { ok: true, id } : { ok: true, id: undefined };
};

const normalizeStore = (store: string): string => store.trim().replace(/\s+/g, " ");

const parseDecimal = (value: string): Decimal => {
  const match = /^(-)?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (match === null) {
    return zero;
  }
  const fraction = match[3] ?? "";
  let scale = fraction.length;
  let coefficient = BigInt(`${match[2]}${fraction}`);
  if (match[4] !== undefined) {
    const exponent = Number(match[4]);
    if (exponent >= 0) {
      coefficient *= 10n ** BigInt(exponent);
    } else {
      scale += -exponent;
    }
  }
  return {
    negative: match[1] === "-" && coefficient !== 0n,
    coefficient,
    scale,
  };
};

const addDecimal = (left: Decimal, right: Decimal): Decimal => {
  const scale = Math.max(left.scale, right.scale);
  const leftCoeff = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightCoeff = right.coefficient * 10n ** BigInt(scale - right.scale);
  const leftSigned = left.negative ? -leftCoeff : leftCoeff;
  const rightSigned = right.negative ? -rightCoeff : rightCoeff;
  const sum = leftSigned + rightSigned;
  return {
    negative: sum < 0n,
    coefficient: sum < 0n ? -sum : sum,
    scale,
  };
};

const subtractDecimal = (left: Decimal, right: Decimal): Decimal =>
  addDecimal(left, {
    negative: right.coefficient === 0n ? false : !right.negative,
    coefficient: right.coefficient,
    scale: right.scale,
  });

const multiplyDecimal = (left: Decimal, right: Decimal): Decimal => ({
  negative: left.negative !== right.negative && left.coefficient !== 0n && right.coefficient !== 0n,
  coefficient: left.coefficient * right.coefficient,
  scale: left.scale + right.scale,
});

const roundHalfUp = (value: Decimal, places: number): Decimal => {
  if (value.scale <= places) {
    return {
      negative: value.negative,
      coefficient: value.coefficient * 10n ** BigInt(places - value.scale),
      scale: places,
    };
  }
  const divisor = 10n ** BigInt(value.scale - places);
  const quotient = value.coefficient / divisor;
  const remainder = value.coefficient % divisor;
  const increment = remainder * 2n >= divisor ? 1n : 0n;
  const coefficient = quotient + increment;
  return {
    negative: coefficient === 0n ? false : value.negative,
    coefficient,
    scale: places,
  };
};

const formatDecimal = (value: Decimal): string => {
  const digits = value.coefficient.toString().padStart(value.scale + 1, "0");
  const whole = value.scale === 0 ? digits : digits.slice(0, -value.scale);
  const fraction = value.scale === 0 ? "" : digits.slice(-value.scale);
  const sign = value.negative && value.coefficient !== 0n ? "-" : "";
  return fraction === "" ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
};

const numberToDecimal = (value: number): Decimal => parseDecimal(String(value));

/**
 * Import-only tax mapping: subtotal is the item sum, total is that sum times
 * 1.13 rounded half-up to 2 decimals, and tax is total minus subtotal.
 *
 * @category models
 * @since 0.1.0
 */
export const importTaxTotals = (
  prices: ReadonlyArray<number>,
): {
  readonly subtotal: DecimalString;
  readonly tax: DecimalString;
  readonly total: DecimalString;
  readonly subtotalNumber: number;
  readonly taxNumber: number;
  readonly totalNumber: number;
} => {
  const subtotal = prices.reduce((sum, price) => addDecimal(sum, numberToDecimal(price)), zero);
  const total = roundHalfUp(multiplyDecimal(subtotal, TAX_RATE), 2);
  const tax = subtractDecimal(total, subtotal);
  const subtotalText = formatDecimal(subtotal);
  const taxText = formatDecimal(tax);
  const totalText = formatDecimal(total);
  return {
    subtotal: DecimalString.make(subtotalText),
    tax: DecimalString.make(taxText),
    total: DecimalString.make(totalText),
    subtotalNumber: Number(subtotalText),
    taxNumber: Number(taxText),
    totalNumber: Number(totalText),
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
  const totals = importTaxTotals(group.items.map((item) => item.price));
  const extractedPayload = {
    importedFrom: "google_sheets_raw",
    store: { name: group.storeName },
    date: group.receiptDate,
    transaction: {
      items: group.items.map((item) => ({ name: item.name, price: item.price })),
      category: group.category,
      subtotal: totals.subtotalNumber,
      tax: totals.taxNumber,
      total: totals.totalNumber,
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
    items: [
      {
        position: 0,
        name: group.items[0].name,
        amount: DecimalString.make(String(group.items[0].price)),
      },
      ...group.items.slice(1).map((item, index) => ({
        position: index + 1,
        name: item.name,
        amount: DecimalString.make(String(item.price)),
      })),
    ],
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
  const order: Array<string> = [];
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
    order.push(key);
  }

  return {
    receipts: order.flatMap((key) => {
      const group = groups.get(key);
      return group === undefined ? [] : [toReceipt(group)];
    }),
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
