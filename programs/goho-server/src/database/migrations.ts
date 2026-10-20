import { PgMigrator } from "@effect/sql-pg";
import { Effect } from "effect";

import receipts from "./migrations/0001-receipts.ts";
import createReceipt from "./migrations/0002-create-receipt.ts";
import bigintReceiptIds from "./migrations/0003-bigint-receipt-ids.ts";
import receiptUploads from "./migrations/0004-receipt-uploads.ts";
import receiptUploadFileId from "./migrations/0005-receipt-upload-file-id.ts";
import dropReceiptIdempotency from "./migrations/0006-drop-receipt-idempotency.ts";
import moveExtractionToUploads from "./migrations/0007-move-extraction-to-uploads.ts";
import defaultReceiptCurrency from "./migrations/0008-default-receipt-currency.ts";
import recordTimestamps from "./migrations/0009-record-timestamps.ts";
import receiptItemIds from "./migrations/0010-receipt-item-ids.ts";
import receiptHistory from "./migrations/0011-receipt-history.ts";
import receiptCategories from "./migrations/0012-receipt-categories.ts";
import itemCategories from "./migrations/0013-item-categories.ts";

/**
 * Explicit migration registry, shared by the migration command and tests.
 *
 * @category models
 * @since 0.1.0
 */
export const run = Effect.fn("@goho/Database.Migrations.run")(function* () {
  return yield* PgMigrator.run({
    loader: PgMigrator.fromRecord({
      "0001_receipts": receipts,
      "0002_create_receipt": createReceipt,
      "0003_bigint_receipt_ids": bigintReceiptIds,
      "0004_receipt_uploads": receiptUploads,
      "0005_receipt_upload_file_id": receiptUploadFileId,
      "0006_drop_receipt_idempotency": dropReceiptIdempotency,
      "0007_move_extraction_to_uploads": moveExtractionToUploads,
      "0008_default_receipt_currency": defaultReceiptCurrency,
      "0009_record_timestamps": recordTimestamps,
      "0010_receipt_item_ids": receiptItemIds,
      "0011_receipt_history": receiptHistory,
      "0012_receipt_categories": receiptCategories,
      "0013_item_categories": itemCategories,
    }),
    table: "goho_migrations",
  });
});
