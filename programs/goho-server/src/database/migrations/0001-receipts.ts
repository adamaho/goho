import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Applied transactionally by the migration runner.
 *
 * @category models
 * @since 0.1.0
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_provider text NOT NULL CHECK (length(btrim(source_provider)) > 0),
      source_file_id text NOT NULL CHECK (length(btrim(source_file_id)) > 0),
      source_file_name text NOT NULL,
      store_name text NOT NULL CHECK (length(btrim(store_name)) > 0),
      receipt_date date NOT NULL,
      category text NOT NULL CHECK (length(btrim(category)) > 0),
      subtotal numeric NOT NULL CHECK (subtotal NOT IN ('NaN', 'Infinity', '-Infinity')),
      tax numeric NOT NULL CHECK (tax NOT IN ('NaN', 'Infinity', '-Infinity')),
      total numeric NOT NULL CHECK (total NOT IN ('NaN', 'Infinity', '-Infinity')),
      currency text CHECK (currency ~ '^[A-Z]{3}$'),
      extraction_version integer NOT NULL CHECK (extraction_version > 0),
      extracted_payload jsonb NOT NULL CHECK (jsonb_typeof(extracted_payload) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (source_provider, source_file_id)
    )
  `;
  yield* sql`
    CREATE TABLE receipt_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      position integer NOT NULL CHECK (position >= 0),
      name text NOT NULL CHECK (length(btrim(name)) > 0),
      amount numeric NOT NULL CHECK (amount NOT IN ('NaN', 'Infinity', '-Infinity')),
      UNIQUE (receipt_id, position)
    )
  `;
  yield* sql`CREATE INDEX receipts_receipt_date_idx ON receipts (receipt_date)`;
});
