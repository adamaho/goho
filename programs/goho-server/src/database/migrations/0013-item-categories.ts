import { Effect } from "effect";
import { SqlClient } from "effect/sql";

// Canonical catalog with display metadata; keys match the app's bundled tag icons and colours.
const presets = [
  { name: "groceries", icon: "groceries", color: "green" },
  { name: "dining", icon: "meals", color: "orange" },
  { name: "shopping", icon: "shopping", color: "purple" },
  { name: "household", icon: "home", color: "brown" },
  { name: "personal care", icon: "personal_care", color: "pink" },
  { name: "health", icon: "health", color: "red" },
  { name: "gas", icon: "transport", color: "blue" },
  { name: "charity", icon: "other", color: "grey" },
];

// Existing names consolidated into each canonical category.
const aliases = [
  { alias: "groceries", canonical: "groceries" },
  { alias: "grocery", canonical: "groceries" },
  { alias: "dairy", canonical: "groceries" },
  { alias: "grocery and personal care", canonical: "groceries" },
  { alias: "produce", canonical: "groceries" },
  { alias: "seafood", canonical: "groceries" },
  { alias: "prepared foods", canonical: "dining" },
  { alias: "coffee", canonical: "dining" },
  { alias: "indian food", canonical: "dining" },
  { alias: "baby supplies", canonical: "shopping" },
  { alias: "general merchandise", canonical: "shopping" },
  { alias: "household", canonical: "household" },
  { alias: "personal care", canonical: "personal care" },
  { alias: "health and fitness", canonical: "health" },
  { alias: "fuel", canonical: "gas" },
  { alias: "charitable donation", canonical: "charity" },
];

/**
 * Moves the required category reference from receipts to their items, seeds and
 * consolidates the canonical catalog, and adds category display metadata. Item
 * history records category changes; receipt history stops recording them and keeps
 * its existing rows.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE categories
      ADD COLUMN icon text NOT NULL DEFAULT 'other' CHECK (icon IN (
        'groceries', 'meals', 'shopping', 'home', 'personal_care', 'health', 'transport',
        'entertainment', 'other'
      )),
      ADD COLUMN color text NOT NULL DEFAULT 'grey' CHECK (color IN (
        'green', 'orange', 'purple', 'brown', 'pink', 'red', 'blue', 'yellow', 'grey'
      ))
  `;

  yield* sql`
    CREATE TEMPORARY TABLE category_presets (
      position int PRIMARY KEY, name text NOT NULL, icon text NOT NULL, color text NOT NULL
    ) ON COMMIT DROP
  `;
  yield* sql`
    INSERT INTO category_presets
    ${sql.insert(presets.map((preset, position) => ({ position, ...preset })))}
  `;
  yield* sql`
    CREATE TEMPORARY TABLE category_aliases (alias text PRIMARY KEY, canonical text NOT NULL)
    ON COMMIT DROP
  `;
  yield* sql`INSERT INTO category_aliases ${sql.insert(aliases)}`;

  // Consolidation is not an edit, so categories keep their timestamps.
  yield* sql`ALTER TABLE categories DISABLE TRIGGER maintain_record_timestamps`;
  // Without its canonical name, the oldest alias becomes the canonical category and keeps its ID.
  yield* sql`
    UPDATE categories AS category SET name = renamed.canonical
    FROM (
      SELECT DISTINCT ON (alias.canonical) alias.canonical, existing.id
      FROM category_aliases alias JOIN categories existing ON existing.name = alias.alias
      WHERE NOT EXISTS (SELECT FROM categories WHERE name = alias.canonical)
      ORDER BY alias.canonical, existing.id
    ) AS renamed
    WHERE category.id = renamed.id
  `;
  yield* sql`
    INSERT INTO categories (name) SELECT name FROM category_presets ORDER BY position
    ON CONFLICT (name) DO NOTHING
  `;
  yield* sql`
    UPDATE categories AS category SET icon = preset.icon, color = preset.color
    FROM category_presets AS preset WHERE preset.name = category.name
  `;
  yield* sql`ALTER TABLE categories ENABLE TRIGGER maintain_record_timestamps`;
  yield* sql`
    CREATE TEMPORARY TABLE category_merges ON COMMIT DROP AS
    SELECT merged.id AS merged_id, canonical.id AS canonical_id
    FROM category_aliases alias
    JOIN categories merged ON merged.name = alias.alias
    JOIN categories canonical ON canonical.name = alias.canonical
    WHERE merged.id <> canonical.id
  `;

  // Each item inherits its receipt's consolidated category. The backfill is not an
  // edit: with the item triggers off, items and their receipts keep their timestamps
  // and gain no history. Disabling triggers is transactional.
  yield* sql`ALTER TABLE receipt_items ADD COLUMN category_id bigint REFERENCES categories(id)`;
  yield* sql`ALTER TABLE receipt_items DISABLE TRIGGER USER`;
  yield* sql`
    UPDATE receipt_items AS item
    SET category_id = coalesce(merge.canonical_id, receipt.category_id)
    FROM receipts AS receipt
    LEFT JOIN category_merges AS merge ON merge.merged_id = receipt.category_id
    WHERE receipt.id = item.receipt_id
  `;
  yield* sql`ALTER TABLE receipt_items ENABLE TRIGGER USER`;
  yield* sql`ALTER TABLE receipt_items ALTER COLUMN category_id SET NOT NULL`;
  yield* sql`CREATE INDEX receipt_items_category_id_idx ON receipt_items (category_id)`;
  yield* sql`ALTER TABLE receipts DROP COLUMN category_id`;
  yield* sql`DELETE FROM categories WHERE id IN (SELECT merged_id FROM category_merges)`;

  // Same as 0012 without the category: receipts no longer have one. Existing
  // category rows stay readable, so the field constraint is unchanged.
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
          OLD.receipt_date::text, NEW.receipt_date::text)
      ) AS change (field, changed, before_value, after_value)
      WHERE change.changed;
      RETURN NULL;
    END;
    $$
  `;

  // Fields changed by one item update share an operation ID; a category change is
  // a reference change recorded with the referenced names.
  yield* sql`
    ALTER TABLE receipt_item_history
      DROP CONSTRAINT receipt_item_history_field_check,
      ADD CONSTRAINT receipt_item_history_field_check CHECK (field IN ('item_name', 'category'))
  `;
  yield* sql`
    CREATE OR REPLACE FUNCTION record_receipt_item_history() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    DECLARE
      edit_operation_id uuid := gen_random_uuid();
    BEGIN
      INSERT INTO receipt_item_history (
        operation_id, receipt_id, item_id, field, before_value, after_value, edited_at
      )
      SELECT edit_operation_id, NEW.receipt_id, NEW.id, change.field, change.before_value,
        change.after_value, statement_timestamp()
      FROM (VALUES
        ('item_name', OLD.name IS DISTINCT FROM NEW.name, OLD.name, NEW.name),
        ('category', OLD.category_id IS DISTINCT FROM NEW.category_id,
          (SELECT name FROM categories WHERE id = OLD.category_id),
          (SELECT name FROM categories WHERE id = NEW.category_id))
      ) AS change (field, changed, before_value, after_value)
      WHERE change.changed;
      RETURN NULL;
    END;
    $$
  `;
});
