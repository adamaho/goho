import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { PgMigrator } from "@effect/sql-pg";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { type CreateRecipeRequest, RecipeId, RecipeUrl } from "@goho/goho-api/recipes";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import { SqlClient, SqlError } from "effect/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import * as RecipeUploadRepository from "#src/recipe-uploads/repository.ts";
import * as RecipeRepository from "#src/recipes/repository.ts";
import { FileId } from "#src/services/file-storage.ts";

const RepositoriesLive = Layer.mergeAll(RecipeRepository.layer, RecipeUploadRepository.layer);

// Each test owns a schema and pool, so tests cannot see each other's rows.
const databaseMigratedBy = <E, R>(migrate: Effect.Effect<unknown, E, R>) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const url = yield* Config.Redacted("TEST_DATABASE_URL");
      const adminContext = yield* Layer.build(Postgres.layer({ url }));
      const admin = Context.get(adminContext, SqlClient.SqlClient);
      const random = yield* SecureRandom.SecureRandom;
      const schema = `test_${(yield* random.uuidV4()).replaceAll("-", "")}`;
      yield* Effect.acquireRelease(admin`CREATE SCHEMA ${admin(schema)}`, () =>
        admin`DROP SCHEMA ${admin(schema)} CASCADE`.pipe(Effect.orDie),
      );
      const testUrl = new URL(Redacted.value(url));
      const options = testUrl.searchParams.get("options") ?? "";
      testUrl.searchParams.set("options", `${options} -c search_path=${schema}`.trim());
      const services = yield* Layer.build(
        RepositoriesLive.pipe(
          Layer.provideMerge(Postgres.layer({ url: Redacted.make(testUrl.toString()) })),
        ),
      );
      yield* migrate.pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
      return services;
    }),
  ).pipe(Layer.provide(NodeCrypto.layer));

const migrationsBefore = (next: string) =>
  PgMigrator.run({
    loader: PgMigrator.fromRecord(
      Object.fromEntries(Object.entries(Migrations.all).filter(([id]) => id < next)),
    ),
    table: "goho_migrations",
  });

const DatabaseLive = databaseMigratedBy(Migrations.run());

// The schema as migration 0019 created it, for the upgrade test.
const RecipesV0019Live = databaseMigratedBy(migrationsBefore("0020"));

const ConstraintCause = Schema.Struct({ constraint: Schema.String });

// The constraint a failed statement violated, as PostgreSQL reported it.
const violated = <R>(statement: Effect.Effect<unknown, SqlError.SqlError, R>) =>
  statement.pipe(
    Effect.flip,
    Effect.map(({ reason }) =>
      reason._tag === "UniqueViolation"
        ? reason.constraint
        : Schema.decodeUnknownSync(ConstraintCause)(reason.cause).constraint,
    ),
  );

const ingredients = [
  { id: "flour", name: "flour", quantity: { kind: "text", text: "some" }, unit: null },
];
const pie: CreateRecipeRequest = {
  title: "Pie",
  ingredients: [
    { id: "flour", name: "flour", quantity: { kind: "text", text: "some" }, unit: null },
  ],
  steps: [{ segments: [{ kind: "text", text: "Bake." }] }],
};
const fractions = [
  {
    id: "flour",
    name: "flour",
    quantity: {
      kind: "range",
      min: { numerator: 1, denominator: 3 },
      max: { numerator: Number.MAX_SAFE_INTEGER, denominator: 7 },
    },
    unit: "cup",
  },
];
const steps = [{ segments: [{ kind: "text", text: "Bake." }] }];

const insertRecipe = (fields: { title?: string; ingredients?: unknown; steps?: unknown } = {}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [row] = yield* sql<{ id: string }>`
      INSERT INTO recipes (title, ingredients, steps)
      VALUES (
        ${fields.title ?? "Bread"},
        ${JSON.stringify(fields.ingredients ?? ingredients)}::jsonb,
        ${JSON.stringify(fields.steps ?? steps)}::jsonb
      )
      RETURNING id::text AS id
    `;
    return row!.id;
  });

const insertUpload = (id: string, status: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO recipe_uploads (id, status) VALUES (${id}, ${status})`;
  });

const insertUrl = (uploadId: string, url: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO recipe_upload_urls (upload_id, url) VALUES (${uploadId}, ${url})`;
  });

// A URL of exactly `bytes` UTF-8 bytes whose last characters are `character`.
const urlOfBytes = (bytes: number, character: string) => {
  const prefix = "https://example.com/";
  const width = new TextEncoder().encode(character).length;
  const count = Math.floor((bytes - prefix.length) / width);
  const url = prefix + "a".repeat(bytes - prefix.length - count * width) + character.repeat(count);
  expect(new TextEncoder().encode(url).length).toBe(bytes);
  return url;
};

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

it.effect("saves recipes without an upload and checks their top-level fields", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // A recipe needs no upload or source; optional fields default to null.
    const id = yield* insertRecipe();
    expect(
      yield* sql`
        SELECT "yield", total_time_seconds, image_file_id, image_content_type
        FROM recipes WHERE id = ${id}
      `,
    ).toEqual([
      { yield: null, total_time_seconds: null, image_file_id: null, image_content_type: null },
    ]);
    // The photo's file and type are set and cleared together.
    yield* sql`
      UPDATE recipes SET "yield" = '{"label": "loaf"}', total_time_seconds = 0,
        image_file_id = 'photo', image_content_type = 'image/webp'
      WHERE id = ${id}
    `;
    yield* sql`UPDATE recipes SET image_file_id = NULL, image_content_type = NULL WHERE id = ${id}`;

    for (const [constraint, statement] of [
      ["recipes_title_check", insertRecipe({ title: "  " })],
      ["recipes_ingredients_check", insertRecipe({ ingredients: [] })],
      ["recipes_ingredients_check", insertRecipe({ ingredients: { flour: 1 } })],
      ["recipes_steps_check", insertRecipe({ steps: [] })],
      ["recipes_yield_check", sql`UPDATE recipes SET "yield" = 'null' WHERE id = ${id}`],
      ["recipes_yield_check", sql`UPDATE recipes SET "yield" = '[]' WHERE id = ${id}`],
      [
        "recipes_total_time_seconds_check",
        sql`UPDATE recipes SET total_time_seconds = -1 WHERE id = ${id}`,
      ],
      ["recipes_image_complete", sql`UPDATE recipes SET image_file_id = 'photo' WHERE id = ${id}`],
      [
        "recipes_image_complete",
        sql`UPDATE recipes SET image_content_type = 'image/png' WHERE id = ${id}`,
      ],
      [
        "recipes_image_content_type_check",
        sql`
          UPDATE recipes SET image_file_id = 'photo', image_content_type = 'image/gif'
          WHERE id = ${id}
        `,
      ],
    ] as const) {
      expect(yield* violated(statement), constraint).toBe(constraint);
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("links succeeded uploads, any number per recipe, and only failed ones to a code", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const recipeId = yield* insertRecipe();
    yield* insertUpload(first, "queued");
    yield* sql`UPDATE recipe_uploads SET status = 'processing' WHERE id = ${first}`;
    yield* sql`
      UPDATE recipe_uploads SET status = 'succeeded', recipe_id = ${recipeId} WHERE id = ${first}
    `;
    // Every import of the page can link its one recipe.
    yield* sql`
      INSERT INTO recipe_uploads (id, status, recipe_id)
      VALUES (${second}, 'succeeded', ${recipeId})
    `;
    yield* sql`
      INSERT INTO recipe_uploads (id, status, failure_code)
      VALUES (gen_random_uuid(), 'failed', 'no_recipe_found')
    `;

    const outcome = "recipe_uploads_outcome_matches_status";
    const upload = (status: string, recipe: string | null, code: string | null) =>
      sql`
        INSERT INTO recipe_uploads (id, status, recipe_id, failure_code)
        VALUES (gen_random_uuid(), ${status}, ${recipe}, ${code})
      `;
    for (const [constraint, statement] of [
      [outcome, upload("queued", recipeId, null)],
      [outcome, upload("processing", null, "internal_error")],
      [outcome, upload("succeeded", null, null)],
      [outcome, upload("failed", null, null)],
      [outcome, sql`UPDATE recipe_uploads SET status = 'failed' WHERE id = ${first}`],
      ["recipe_uploads_failure_code_check", upload("failed", null, "storage_failed")],
      ["recipe_uploads_recipe_id_fkey", upload("succeeded", "-1", null)],
    ] as const) {
      expect(yield* violated(statement), constraint).toBe(constraint);
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("lets uploads share a page, and keeps one recipe per normalized URL", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const page = "https://example.com/bread";
    const recipeId = yield* insertRecipe();
    yield* insertUpload(first, "queued");
    yield* insertUrl(first, `${page}#method`);
    yield* insertUpload(second, "queued");
    yield* insertUrl(second, page);
    // Each upload still has one URL, which goes with it.
    expect(yield* violated(insertUrl(first, `${page}?again`))).toBe("recipe_upload_urls_pkey");
    for (const id of [first, second]) {
      yield* sql`UPDATE recipe_uploads SET status = 'processing' WHERE id = ${id}`;
      yield* sql`
        UPDATE recipe_uploads SET status = 'succeeded', recipe_id = ${recipeId} WHERE id = ${id}
      `;
    }

    // A recipe saved from a page is its only recipe, with its source and key set
    // together; a direct one has neither.
    yield* sql`
      UPDATE recipes SET source_url = ${`${page}#method`}, normalized_url = ${page}
      WHERE id = ${recipeId}
    `;
    const other = yield* insertRecipe();
    yield* insertRecipe();
    const setSource = (sourceUrl: string | null, normalizedUrl: string | null) =>
      sql`
        UPDATE recipes SET source_url = ${sourceUrl}, normalized_url = ${normalizedUrl}
        WHERE id = ${other}
      `;
    for (const [constraint, statement] of [
      ["recipes_normalized_url_key", setSource(page, page)],
      ["recipes_source_complete", setSource(`${page}/rye`, null)],
      ["recipes_source_complete", setSource(null, `${page}/rye`)],
      ["recipes_source_url_check", setSource(" ", `${page}/rye`)],
      ["recipes_normalized_url_check", setSource(`${page}/rye`, " ")],
    ] as const) {
      expect(yield* violated(statement), constraint).toBe(constraint);
    }
    for (const character of ["a", "é", "€", "😀"]) {
      const fits = urlOfBytes(2048, character);
      const over = urlOfBytes(2049, character);
      yield* setSource(fits, fits);
      expect(yield* violated(setSource(over, fits)), character).toBe("recipes_source_url_check");
      expect(yield* violated(setSource(fits, over)), character).toBe(
        "recipes_normalized_url_check",
      );
    }

    // A linked recipe still cannot be deleted; deleting its uploads removes their URLs.
    expect(yield* violated(sql`DELETE FROM recipes WHERE id = ${recipeId}`)).toBe(
      "recipe_uploads_recipe_id_fkey",
    );
    yield* sql`DELETE FROM recipe_uploads WHERE recipe_id = ${recipeId}`;
    yield* sql`DELETE FROM recipes WHERE id = ${recipeId}`;
    expect(yield* sql`SELECT upload_id FROM recipe_upload_urls`).toEqual([]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("limits submitted URLs to 2048 UTF-8 bytes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* insertUpload(first, "queued");
    for (const character of ["a", "é", "€", "😀"]) {
      yield* insertUrl(first, urlOfBytes(2048, character));
      yield* sql`DELETE FROM recipe_upload_urls`;
      expect(yield* violated(insertUrl(first, urlOfBytes(2049, character))), character).toBe(
        "recipe_upload_urls_url_check",
      );
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("upgrades saved recipes and imports unchanged to key each recipe by its source", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const migrationIds = sql<{ id: number }>`
      SELECT migration_id AS id FROM goho_migrations ORDER BY migration_id
    `.pipe(Effect.map((rows) => rows.map(({ id }) => id)));
    expect((yield* migrationIds).at(-1)).toBe(19);

    // A direct recipe with a photo, and a recipe its import saved, with fractions and a photo.
    const insertWithPhoto = (title: string, body: unknown, fileId: string, contentType: string) =>
      sql<{ id: string }>`
        INSERT INTO recipes (title, ingredients, steps, image_file_id, image_content_type)
        VALUES (
          ${title}, ${JSON.stringify(body)}::jsonb, ${JSON.stringify(steps)}::jsonb,
          ${fileId}, ${contentType}
        )
        RETURNING id::text AS id
      `.pipe(Effect.map(([row]) => RecipeId.make(row?.id ?? "")));
    const direct = yield* insertWithPhoto("Toast", ingredients, "direct-photo", "image/png");
    const imported = yield* insertWithPhoto("Bread", fractions, "bread-photo", "image/webp");
    const succeeded = RecipeUploadId.make("00000000-0000-4000-8000-00000000000a");
    const failed = RecipeUploadId.make("00000000-0000-4000-8000-00000000000b");
    const queued = RecipeUploadId.make("00000000-0000-4000-8000-00000000000c");
    yield* sql`
      INSERT INTO recipe_uploads (id, status, recipe_id, failure_code) VALUES
        (${succeeded}, 'succeeded', ${imported}, NULL),
        (${failed}, 'failed', NULL, 'no_recipe_found'),
        (${queued}, 'queued', NULL, NULL)
    `;
    // Migration 0019 stored each URL's normalized form beside it.
    yield* sql`
      INSERT INTO recipe_upload_urls (upload_id, url, normalized_url) VALUES
        (${succeeded}, 'https://Example.com/bread#top', 'https://example.com/bread'),
        (${failed}, 'https://example.com/cake', 'https://example.com/cake'),
        (${queued}, 'https://example.com/pie#crust', 'https://example.com/pie')
    `;
    // Old rows keep their times, which differ from the migration's.
    yield* sql`ALTER TABLE recipes DISABLE TRIGGER maintain_record_timestamps`;
    yield* sql`ALTER TABLE recipe_uploads DISABLE TRIGGER maintain_record_timestamps`;
    yield* sql`UPDATE recipes SET created_at = '2026-01-02T03:04:05Z', updated_at = '2026-02-03Z'`;
    yield* sql`UPDATE recipe_uploads SET created_at = '2026-01-02Z', updated_at = '2026-03-04Z'`;
    yield* sql`ALTER TABLE recipe_uploads ENABLE TRIGGER maintain_record_timestamps`;
    yield* sql`ALTER TABLE recipes ENABLE TRIGGER maintain_record_timestamps`;

    const snapshot = Effect.all([
      sql`SELECT * FROM recipes ORDER BY id`,
      sql`SELECT * FROM recipe_uploads ORDER BY id`,
      sql`SELECT * FROM recipe_upload_urls ORDER BY upload_id`,
    ]);
    const [recipesBefore, uploadsBefore, urlsBefore] = yield* snapshot;

    expect(yield* Migrations.run().pipe(Effect.provide(NodeServices.layer))).toEqual([
      [20, "recipe_url_identity"],
    ]);

    // Every other value and timestamp stays. The saved recipe takes its import's
    // URLs before the uploads' normalized URLs are dropped.
    const [recipesAfter, uploadsAfter, urlsAfter] = yield* snapshot;
    expect(uploadsAfter).toEqual(uploadsBefore);
    expect(urlsAfter).toEqual(urlsBefore.map(({ upload_id, url }) => ({ upload_id, url })));
    expect(recipesAfter).toEqual(
      recipesBefore.map((row) =>
        row.title === "Bread"
          ? {
              ...row,
              source_url: "https://Example.com/bread#top",
              normalized_url: "https://example.com/bread",
            }
          : { ...row, source_url: null, normalized_url: null },
      ),
    );

    // The repositories read the upgraded rows exactly.
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const source = { kind: "url", url: "https://Example.com/bread#top" };
    expect(yield* recipes.findById(imported)).toEqual(
      Option.some(
        expect.objectContaining({
          id: imported,
          source,
          ingredients: fractions,
          hasImage: true,
        }),
      ),
    );
    expect((yield* recipes.list).map(({ id, source }) => ({ id, source }))).toEqual([
      { id: imported, source },
      { id: direct, source: null },
    ]);
    expect(yield* recipes.findImage(direct)).toEqual(
      Option.some({ fileId: FileId.make("direct-photo"), contentType: "image/png" }),
    );
    expect(yield* recipes.findImage(imported)).toEqual(
      Option.some({ fileId: FileId.make("bread-photo"), contentType: "image/webp" }),
    );

    // The saved page is found however it is written; a failed import's page has no recipe.
    expect(yield* recipes.findIdByUrl(RecipeUrl.make("https://example.com/bread#again"))).toEqual(
      Option.some(imported),
    );
    expect(yield* recipes.findIdByUrl(RecipeUrl.make("https://example.com/cake"))).toEqual(
      Option.none(),
    );

    // An import queued before the upgrade saves its page's recipe with its URL as the source.
    yield* uploads.markProcessing(queued);
    const saved = yield* sql.withTransaction(
      recipes
        .findOrCreateByUrl(RecipeUrl.make("https://example.com/pie#crust"), pie)
        .pipe(Effect.tap(({ recipe }) => uploads.markSucceeded(queued, recipe.id))),
    );
    expect(saved.created).toBe(true);
    expect(yield* recipes.findById(saved.recipe.id)).toEqual(
      Option.some(
        expect.objectContaining({
          source: { kind: "url", url: "https://example.com/pie#crust" },
        }),
      ),
    );
  }).pipe(Effect.provide(RecipesV0019Live)),
);
