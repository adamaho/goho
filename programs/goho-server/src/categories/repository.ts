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
  readonly listNames: (
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

// The category `c` as its API object; text IDs keep their precision in JSON.
const categoryObject =
  "jsonb_build_object('id', c.id::text, 'name', c.name, 'icon', c.icon, 'color', c.color, 'kinds', to_jsonb(c.kinds))";

const CategoryRow = Schema.Struct({ category: Category });

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
    const category = sql.literal(categoryObject);

    const selectNames = SqlSchema.findAll({
      Request: CategoryKind,
      Result: Schema.Struct({ name: Schema.String }),
      execute: (kind) => sql`
        SELECT name FROM categories WHERE ${kind}::category_kind = ANY(kinds) ORDER BY name
      `,
    });

    const findCategory = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: CategoryRow,
      execute: (name) => sql`
        SELECT ${category} AS category FROM categories c WHERE c.name = lower(btrim(${name}))
      `,
    });

    const insertCategory = SqlSchema.findOneOption({
      Request: Schema.Struct({ name: Schema.String, kind: CategoryKind }),
      Result: CategoryRow,
      execute: ({ name, kind }) => sql`
        INSERT INTO categories AS c (name, kinds)
        VALUES (lower(btrim(${name})), ARRAY[${kind}::category_kind])
        ON CONFLICT (name) DO NOTHING RETURNING ${category} AS category
      `,
    });

    // The guard re-checks the latest row version after a concurrent update, so
    // concurrent saves of different kinds both keep theirs.
    const addKind = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: CategoryId, kind: CategoryKind }),
      Result: CategoryRow,
      execute: ({ id, kind }) => sql`
        UPDATE categories AS c SET kinds = category_kinds_with(c.kinds, ${kind}::category_kind)
        WHERE c.id = ${id} AND NOT (${kind}::category_kind = ANY(c.kinds))
        RETURNING ${category} AS category
      `,
    });

    const listNames = Effect.fn("@goho/CategoryRepository.listNames")(
      (kind: CategoryKind) =>
        selectNames(kind).pipe(Effect.map((rows) => rows.map((row) => row.name))),
      Effect.mapError((cause) => new PersistenceError({ operation: "listNames", cause })),
    );

    const withKind = Effect.fnUntraced(function* (existing: Category, kind: CategoryKind) {
      if (existing.kinds.includes(kind)) return existing;
      const updated = yield* addKind({ id: existing.id, kind });
      if (Option.isSome(updated)) return updated.value.category;
      // A concurrent save added the kind first.
      const reread = yield* findCategory(existing.name).pipe(Effect.flatMap(Effect.fromOption));
      return reread.category;
    });

    // Looking up first keeps reuse from consuming identity values. When a
    // concurrent transaction commits the same name after that lookup, the insert
    // does nothing and a new statement sees the committed row.
    const findOrCreate = Effect.fn("@goho/CategoryRepository.findOrCreate")(
      function* (name: string, kind: CategoryKind) {
        const existing = yield* findCategory(name);
        if (Option.isSome(existing)) return yield* withKind(existing.value.category, kind);
        const inserted = yield* insertCategory({ name, kind });
        if (Option.isSome(inserted)) return inserted.value.category;
        const committed = yield* findCategory(name).pipe(Effect.flatMap(Effect.fromOption));
        return yield* withKind(committed.category, kind);
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findOrCreate", cause })),
    );

    return Service.of({ findOrCreate, listNames });
  }),
);
