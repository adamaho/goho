import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Records saved corrections to receipt store name, purchase date, and category
 * in `receipt_history`, and to item names in `receipt_item_history`, including
 * direct SQL edits. Triggers write one row per changed field, and every updated
 * row gets its own operation ID. History commits or rolls back with the edit and
 * is deleted with its receipt or item.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Existing rows get no baseline; history starts with the first edit after this migration.
  yield* sql`
    CREATE TABLE receipt_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      operation_id uuid NOT NULL,
      receipt_id bigint NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      field text NOT NULL CHECK (field IN ('store_name', 'receipt_date', 'category')),
      before_value text NOT NULL,
      after_value text NOT NULL,
      edited_at timestamptz NOT NULL
    )
  `;
  yield* sql`CREATE INDEX receipt_history_receipt_id_idx ON receipt_history (receipt_id)`;
  // The receipt is the item's parent at edit time.
  yield* sql`
    CREATE TABLE receipt_item_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      operation_id uuid NOT NULL,
      receipt_id bigint NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      item_id bigint NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
      field text NOT NULL CHECK (field = 'item_name'),
      before_value text NOT NULL,
      after_value text NOT NULL,
      edited_at timestamptz NOT NULL
    )
  `;
  yield* sql`CREATE INDEX receipt_item_history_receipt_id_idx ON receipt_item_history (receipt_id)`;
  yield* sql`CREATE INDEX receipt_item_history_item_id_idx ON receipt_item_history (item_id)`;

  // The fixed DateStyle keeps stored dates ISO whatever the session uses. Statement
  // time matches the updated_at value the timestamp trigger writes for the same edit.
  yield* sql`
    CREATE FUNCTION record_receipt_history() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT SET datestyle TO 'ISO, YMD' AS $$
    DECLARE
      edit_operation_id uuid := gen_random_uuid();
    BEGIN
      INSERT INTO receipt_history (
        operation_id, receipt_id, field, before_value, after_value, edited_at
      )
      SELECT edit_operation_id, NEW.id, change.field, change.before_value, change.after_value,
        statement_timestamp()
      FROM (VALUES
        ('store_name', OLD.store_name IS DISTINCT FROM NEW.store_name,
          OLD.store_name, NEW.store_name),
        ('receipt_date', OLD.receipt_date IS DISTINCT FROM NEW.receipt_date,
          OLD.receipt_date::text, NEW.receipt_date::text),
        ('category', OLD.category IS DISTINCT FROM NEW.category,
          OLD.category, NEW.category)
      ) AS change (field, changed, before_value, after_value)
      WHERE change.changed;
      RETURN NULL;
    END;
    $$
  `;
  yield* sql`
    CREATE TRIGGER record_receipt_history
    AFTER UPDATE ON receipts
    FOR EACH ROW EXECUTE FUNCTION record_receipt_history()
  `;

  yield* sql`
    CREATE FUNCTION record_receipt_item_history() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF OLD.name IS DISTINCT FROM NEW.name THEN
        INSERT INTO receipt_item_history (
          operation_id, receipt_id, item_id, field, before_value, after_value, edited_at
        ) VALUES (
          gen_random_uuid(), NEW.receipt_id, NEW.id, 'item_name', OLD.name, NEW.name,
          statement_timestamp()
        );
      END IF;
      RETURN NULL;
    END;
    $$
  `;
  yield* sql`
    CREATE TRIGGER record_receipt_item_history
    AFTER UPDATE ON receipt_items
    FOR EACH ROW EXECUTE FUNCTION record_receipt_item_history()
  `;
});
