import { Category } from "@goho/goho-api/receipts";
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
  /** Every stored category name, alphabetically; empty when none exist. */
  readonly listNames: Effect.Effect<ReadonlyArray<string>, PersistenceError>;
  /**
   * Returns the category whose name is the trimmed lowercase form of `name`, creating it
   * with the generic `other` icon and `grey` colour when none exists. A created category
   * joins the caller's transaction and rolls back with it; reusing a category leaves its
   * row unchanged.
   */
  readonly findOrCreate: (name: string) => Effect.Effect<Category, PersistenceError>;
}

/**
 * Shared catalog of lowercase category names and their display metadata.
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

    const selectNames = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Schema.Struct({ name: Schema.String }),
      execute: () => sql`SELECT name FROM categories ORDER BY name`,
    });

    const findCategory = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Category,
      execute: (name) => sql`
        SELECT id::text, name, icon, color FROM categories WHERE name = lower(btrim(${name}))
      `,
    });

    const insertCategory = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Category,
      execute: (name) => sql`
        INSERT INTO categories (name) VALUES (lower(btrim(${name})))
        ON CONFLICT (name) DO NOTHING RETURNING id::text, name, icon, color
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
        const existing = yield* findCategory(name);
        if (Option.isSome(existing)) return existing.value;
        const inserted = yield* insertCategory(name);
        if (Option.isSome(inserted)) return inserted.value;
        return yield* findCategory(name).pipe(Effect.flatMap(Effect.fromOption));
      },
      Effect.mapError((cause) => new PersistenceError({ operation: "findOrCreate", cause })),
    );

    return Service.of({ findOrCreate, listNames });
  }),
);
