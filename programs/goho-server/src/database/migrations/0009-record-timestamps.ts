import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/** Track record history independently of the purchase date, including direct SQL edits. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Backfill before installing triggers so migration time does not replace record history.
  yield* sql`ALTER TABLE receipts ADD COLUMN updated_at timestamptz`;
  yield* sql`UPDATE receipts SET updated_at = created_at`;
  yield* sql`
    ALTER TABLE receipts
      ALTER COLUMN updated_at SET DEFAULT now(),
      ALTER COLUMN updated_at SET NOT NULL
  `;
  yield* sql`
    ALTER TABLE receipt_items
      ADD COLUMN created_at timestamptz,
      ADD COLUMN updated_at timestamptz
  `;
  yield* sql`
    UPDATE receipt_items AS item
    SET created_at = receipt.created_at, updated_at = receipt.created_at
    FROM receipts AS receipt WHERE receipt.id = item.receipt_id
  `;
  yield* sql`
    ALTER TABLE receipt_items
      ALTER COLUMN created_at SET DEFAULT now(),
      ALTER COLUMN created_at SET NOT NULL,
      ALTER COLUMN updated_at SET DEFAULT now(),
      ALTER COLUMN updated_at SET NOT NULL
  `;

  // Statement time also records edits made later within a long-running transaction.
  yield* sql`
    CREATE FUNCTION maintain_record_timestamps() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      NEW.created_at := OLD.created_at;
      NEW.updated_at := statement_timestamp();
      RETURN NEW;
    END;
    $$
  `;
  for (const table of ["receipts", "receipt_items", "receipt_uploads"]) {
    yield* sql`
      CREATE TRIGGER maintain_record_timestamps
      BEFORE UPDATE ON ${sql(table)}
      FOR EACH ROW EXECUTE FUNCTION maintain_record_timestamps()
    `;
  }

  yield* sql`
    CREATE FUNCTION touch_receipt_from_item() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        UPDATE receipts SET updated_at = statement_timestamp() WHERE id = OLD.receipt_id;
      ELSE
        UPDATE receipts SET updated_at = statement_timestamp() WHERE id = NEW.receipt_id;
        IF TG_OP = 'UPDATE' AND OLD.receipt_id IS DISTINCT FROM NEW.receipt_id THEN
          UPDATE receipts SET updated_at = statement_timestamp() WHERE id = OLD.receipt_id;
        END IF;
      END IF;
      RETURN NULL;
    END;
    $$
  `;
  yield* sql`
    CREATE TRIGGER touch_receipt_from_item
    AFTER INSERT OR UPDATE OR DELETE ON receipt_items
    FOR EACH ROW EXECUTE FUNCTION touch_receipt_from_item()
  `;
});
