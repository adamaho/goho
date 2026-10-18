import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Moves receipt categories into a shared `categories` catalog of lowercase names
 * and gives every receipt a required `category_id`. Category history keeps
 * recording readable names; existing history rows stay as originally recorded.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE categories (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL UNIQUE
        CHECK (length(name) > 0 AND name = lower(btrim(name))),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  yield* sql`
    CREATE TRIGGER maintain_record_timestamps
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION maintain_record_timestamps()
  `;

  // Case and space-padded variants become one category; distinct words stay separate.
  // The old schema accepted padded text from direct SQL, though the API always trimmed.
  yield* sql`
    INSERT INTO categories (name)
    SELECT DISTINCT lower(btrim(category)) FROM receipts ORDER BY 1
  `;
  yield* sql`ALTER TABLE receipts ADD COLUMN category_id bigint REFERENCES categories(id)`;
  // The backfill is not an edit: without the update triggers, receipts keep their
  // timestamps and gain no history. Disabling triggers is transactional.
  yield* sql`ALTER TABLE receipts DISABLE TRIGGER maintain_record_timestamps`;
  yield* sql`ALTER TABLE receipts DISABLE TRIGGER record_receipt_history`;
  yield* sql`
    UPDATE receipts AS receipt SET category_id = category.id
    FROM categories AS category WHERE category.name = lower(btrim(receipt.category))
  `;
  yield* sql`ALTER TABLE receipts ENABLE TRIGGER maintain_record_timestamps`;
  yield* sql`ALTER TABLE receipts ENABLE TRIGGER record_receipt_history`;
  yield* sql`ALTER TABLE receipts ALTER COLUMN category_id SET NOT NULL`;
  yield* sql`CREATE INDEX receipts_category_id_idx ON receipts (category_id)`;

  // Same history as 0011, except a category change is a reference change recorded
  // with the referenced names.
  yield* sql`
    CREATE OR REPLACE FUNCTION record_receipt_history() RETURNS trigger
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
        ('category', OLD.category_id IS DISTINCT FROM NEW.category_id,
          (SELECT name FROM categories WHERE id = OLD.category_id),
          (SELECT name FROM categories WHERE id = NEW.category_id))
      ) AS change (field, changed, before_value, after_value)
      WHERE change.changed;
      RETURN NULL;
    END;
    $$
  `;
  yield* sql`ALTER TABLE receipts DROP COLUMN category`;
});
