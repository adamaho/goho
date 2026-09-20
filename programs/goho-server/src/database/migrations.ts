import { PgMigrator } from "@effect/sql-pg";
import { Effect } from "effect";

import receipts from "./migrations/0001-receipts.ts";
import createReceipt from "./migrations/0002-create-receipt.ts";
import bigintReceiptIds from "./migrations/0003-bigint-receipt-ids.ts";
import receiptUploads from "./migrations/0004-receipt-uploads.ts";
import receiptUploadFileId from "./migrations/0005-receipt-upload-file-id.ts";

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
    }),
    table: "goho_migrations",
  });
});
