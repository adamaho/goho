import { Category, CategoryId, CategoryKind } from "@goho/goho-api/categories";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

/**
 * Expected failure while reading or saving categories.
 *
 * @category errors
 * @since 0.1.0
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "GohoServer.CategoryRepository.PersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Category persistence operations.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /** Every stored category name of `kind`, alphabetically; empty when none exist. */
  readonly listNamesForCategory: (
    kind: CategoryKind,
  ) => Effect.Effect<ReadonlyArray<string>, PersistenceError>;
  /**
   * Returns the category whose name is the trimmed lowercase form of `name`,
   * creating it as a `kind` category with the generic `other` icon and `grey`
   * colour when none exists. Reusing a category of another kind adds `kind` to it
   * and keeps its ID; reusing one that already has `kind` leaves its row
   * unchanged. Changes join the caller's transaction and roll back with it.
   */
  readonly findOrCreate: (
    name: string,
    kind: CategoryKind,
  ) => Effect.Effect<Category, PersistenceError>;
}

/**
 * Shared catalog of lowercase category names, their display metadata, and the
 * domains each applies to.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/CategoryRepository",
) {}

/**
 * Stores categories on the shared SQL client. Names are normalized in SQL with
 * `lower(btrim(...))`, matching the migration that built the catalog from receipts.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // The driver cannot decode the enum array, so kinds are read as text.
    const category = sql.literal("id::text, name, icon, color, kinds::text[] AS kinds");

    const selectNames = SqlSchema.findAll({
      Request: CategoryKind,
      Result: Schema.Struct({ name: Schema.String }),
      execute: (kind) => sql`
        SELECT name FROM categories WHERE ${kind}::category_kind = ANY(kinds) ORDER BY name
      `,
    });

    const findCategory = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Category,
      execute: (name) => sql`
        SELECT ${category} FROM categories WHERE name = lower(btrim(${name}))
      `,
    });

    const insertCategory = SqlSchema.findOneOption({
      Request: Schema.Struct({ name: Schema.String, kind: CategoryKind }),
      Result: Category,
      execute: ({ name, kind }) => sql`
        INSERT INTO categories (name, kinds)
        VALUES (lower(btrim(${name})), ARRAY[${kind}::category_kind])
        ON CONFLICT (name) DO NOTHING RETURNING ${category}
      `,
    });

    const addKind = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: CategoryId, kind: CategoryKind }),
      Result: Category,
      execute: ({ id, kind }) => sql`
        UPDATE categories SET kinds = category_kinds_with(kinds, ${kind}::category_kind)
        WHERE id = ${id} AND NOT (${kind}::category_kind = ANY(kinds))
        RETURNING ${category}
      `,
    });

    const listNamesForCategory = Effect.fn("@goho/CategoryRepository.listNamesForCategory")(
      (kind: CategoryKind) =>
        selectNames(kind).pipe(Effect.map((rows) => rows.map((row) => row.name))),
      Effect.mapError(
        (cause) => new PersistenceError({ operation: "listNamesForCategory", cause }),
      ),
    );

    const withKind = Effect.fnUntraced(function* (existing: Category, kind: CategoryKind) {
      if (existing.kinds.includes(kind)) return existing;
      const updated = yield* addKind({ id: existing.id, kind });
      if (Option.isSome(updated)) return updated.value;
      return yield* findCategory(existing.name).pipe(Effect.flatMap(Effect.fromOption));
    });

    const findOrCreate = Effect.fn("@goho/CategoryRepository.findOrCreate")(
      function* (name: string, kind: CategoryKind) {
        const existing = yield* findCategory(name);
        if (Option.isSome(existing)) return yield* withKind(existing.value, kind);
        const inserted = yield* insertCategory({ name, kind });
        if (Option.isSome(inserted)) return inserted.value;
        const committed = yield* findCategory(name).pipe(Effect.flatMap(Effect.fromOption));
        return yield* withKind(committed, kind);
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findOrCreate", cause })),
    );

    return Service.of({ findOrCreate, listNamesForCategory });
  }),
);
