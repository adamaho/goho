# @goho/raw-csv-importer

Disposable command for importing historical RAW receipt rows from a local CSV
export directly into the Goho PostgreSQL database. It does not call Google, AI
providers, or the Goho server, and it is meant to be deleted after the
migration.

## Commands

From the repository root after the [development setup](../../CONTRIBUTING.md#development-setup):

```bash
# Offline dry run: no DATABASE_URL, connection, or writes
pnpm --filter @goho/raw-csv-importer start --file /absolute/path/raw.csv

# Insert into the database named by DATABASE_URL
DATABASE_URL=postgres://... pnpm --filter @goho/raw-csv-importer start --file /absolute/path/raw.csv --apply
```

Use an absolute `--file` path: pnpm runs the script from this package
directory. `DATABASE_URL` can also come from an untracked `.env` in this
directory. Run with `--help` for usage.

## Input

The first record must be exactly this header:

```text
store,date,category,item,price,source_file_id
```

- Quoted commas, doubled quotes, and line breaks inside quoted fields are
  supported. Malformed quoting stops parsing; records after it are not
  validated.
- References use the CSV record number, where the header is record 1, plus the
  source lines it spans. Blank records are skipped but still counted.
- `store`, `category`, and `item` must be nonempty after trimming.
  `source_file_id` is accepted and ignored.
- `date` is `YYYY-MM-DD` or a whole Google Sheets date number, where `45657`
  is `2024-12-31`. Slash dates such as `01/02/2024` and impossible dates are
  errors. Purchase dates are kept as given.
- `price` is plain decimal text such as `12.34`, `-1.00`, or `1e2`; currency
  symbols, thousands separators, and plus signs are errors.

## Receipts

- Retained records with the same store and purchase date form one receipt,
  even when other rows separate them. Stores match after trimming, collapsing
  whitespace, and ignoring case; the receipt shows the first spelling with
  whitespace cleaned up. Separate visits on one day therefore merge.
- Items keep their CSV order, including repeated names and zero prices.
- Negative-price records are reported and left out of amounts and category
  selection. A group with only negative prices creates no receipt.
- The category is the one on the most retained rows. A tie goes to the tied
  category that appears first.
- Every receipt is CAD; amounts are not converted.
- Item prices and the subtotal keep their exact decimal precision.
  **Tax and totals are calculated, not imported:** tax is 13% of the
  subtotal, rounded once to cents with ties away from zero, and total is
  subtotal plus tax.

## Output and exit status

The report lists each planned receipt with its record references, ordered
items, category, and CAD subtotal, calculated tax, and calculated total, then
the skipped negative-price records, every validation error, and counts.

Any validation error, header problem, or malformed CSV exits with status 1 and
nothing is written. A valid dry run ends with a line saying the CSV is
importable and nothing was written.

## Apply

`--apply` parses and validates the whole file before reading `DATABASE_URL` or
connecting. If any error exists, it writes nothing. Otherwise it inserts every
receipt and its ordered items, positions `0..n-1`, in one transaction and
reports the inserted counts after commit. A SQL failure rolls back the whole
import and exits with status 1. A lost connection is reported without a
rollback claim because the commit outcome cannot be confirmed; check the
database before running again. Failures are not retried.

Each apply inserts new receipts. There is no deduplication, matching against
existing receipts, import history, resume, or update, so **running `--apply`
twice with the same file creates duplicates**. Remove unwanted duplicates
manually.

The target database must already be migrated; the importer does not run
migrations. Database defaults assign receipt IDs and record timestamps. No
receipt uploads are created.

## Tests

```bash
pnpm --filter @goho/raw-csv-importer test:unit
TEST_DATABASE_URL=postgres://... pnpm --filter @goho/raw-csv-importer test:integration
```

Integration tests create a temporary schema per test in `TEST_DATABASE_URL`,
migrate it with the server's `src/database/migrate.ts` command in a child
process, run the importer against it, and drop the schema afterwards. Never
point `TEST_DATABASE_URL` at production or normal development data.

## Removal

Delete `programs/goho-raw-csv-importer`, remove the `csv-parse` entry from the
catalog in `pnpm-workspace.yaml`, and run `pnpm install` to update
`pnpm-lock.yaml`. Imported receipts stay as ordinary receipts; no schema change
or reverse migration is involved.
