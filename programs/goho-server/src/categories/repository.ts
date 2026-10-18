import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

/**
 * Internal category reference; receipts expose only the category name.
 *
 * @category models
 * @since 0.1.0
 */
export const CategoryId = Schema.BigInt.pipe(Schema.brand("CategoryId"));

/**
 * Internal category reference; receipts expose only the category name.
 *
 * @category models
 * @since 0.1.0
 */
export type CategoryId = typeof CategoryId.Type;

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
  /** Every stored category name, alphabetically; empty when none exist. */
  readonly listNames: Effect.Effect<ReadonlyArray<string>, PersistenceError>;
  /**
   * Returns the category whose name is the trimmed lowercase form of `name`, creating it
   * when none exists. A created category joins the caller's transaction and rolls
   * back with it; reusing a category leaves its row unchanged.
   */
  readonly findOrCreate: (name: string) => Effect.Effect<CategoryId, PersistenceError>;
}

/**
 * Shared catalog of lowercase category names.
 *
 * @category models
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@goho/goho-server/CategoryRepository",
) {}

const IdRow = Schema.Struct({ id: CategoryId });

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

    const selectNames = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Schema.Struct({ name: Schema.String }),
      execute: () => sql`SELECT name FROM categories ORDER BY name`,
    });

    const findId = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: IdRow,
      execute: (name) => sql`SELECT id FROM categories WHERE name = lower(btrim(${name}))`,
    });

    const insertId = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: IdRow,
      execute: (name) => sql`
        INSERT INTO categories (name) VALUES (lower(btrim(${name})))
        ON CONFLICT (name) DO NOTHING RETURNING id
      `,
    });

    const listNames = selectNames(undefined).pipe(
      Effect.map((rows) => rows.map((row) => row.name)),
      Effect.mapError((cause) => new PersistenceError({ operation: "listNames", cause })),
      Effect.withSpan("@goho/CategoryRepository.listNames"),
    );

    // Looking up first keeps reuse from consuming identity values. When a
    // concurrent transaction commits the same name after that lookup, the insert
    // does nothing and a new statement sees the committed row.
    const findOrCreate = Effect.fn("@goho/CategoryRepository.findOrCreate")(
      function* (name: string) {
        const existing = yield* findId(name);
        if (Option.isSome(existing)) return existing.value.id;
        const inserted = yield* insertId(name);
        if (Option.isSome(inserted)) return inserted.value.id;
        const committed = yield* findId(name).pipe(Effect.flatMap(Effect.fromOption));
        return committed.id;
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findOrCreate", cause })),
    );

    return Service.of({ findOrCreate, listNames });
  }),
);
