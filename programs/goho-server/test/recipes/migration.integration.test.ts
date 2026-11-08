import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import { SqlClient, SqlError } from "effect/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";

// Each test owns a schema and pool, so tests cannot see each other's rows.
const DatabaseLive = Layer.effectContext(
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
    const services = yield* Layer.build(Postgres.layer({ url: Redacted.make(testUrl.toString()) }));
    yield* Migrations.run().pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
).pipe(Layer.provide(NodeCrypto.layer));

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

const insertUrl = (uploadId: string, url: string, normalizedUrl = url) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO recipe_upload_urls (upload_id, url, normalized_url)
      VALUES (${uploadId}, ${url}, ${normalizedUrl})
    `;
  });

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

it.effect("links only succeeded uploads to one recipe and only failed ones to a code", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const recipeId = yield* insertRecipe();
    yield* insertUpload(first, "queued");
    yield* sql`UPDATE recipe_uploads SET status = 'processing' WHERE id = ${first}`;
    yield* sql`
      UPDATE recipe_uploads SET status = 'succeeded', recipe_id = ${recipeId} WHERE id = ${first}
    `;
    yield* sql`
      INSERT INTO recipe_uploads (id, status, failure_code)
      VALUES (${second}, 'failed', 'no_recipe_found')
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
      ["recipe_uploads_recipe_id_key", upload("succeeded", recipeId, null)],
    ] as const) {
      expect(yield* violated(statement), constraint).toBe(constraint);
    }
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("keeps one upload per normalized URL until that upload is deleted", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const page = "https://example.com/bread";
    const recipeId = yield* insertRecipe();
    yield* insertUpload(first, "queued");
    yield* insertUrl(first, `${page}#method`, page);
    yield* insertUpload(second, "queued");
    expect(yield* violated(insertUrl(second, page))).toBe("recipe_upload_urls_normalized_url_key");
    expect(yield* violated(insertUrl(first, `${page}?again`, `${page}?again`))).toBe(
      "recipe_upload_urls_pkey",
    );
    yield* sql`
      UPDATE recipe_uploads SET status = 'succeeded', recipe_id = ${recipeId} WHERE id = ${first}
    `;

    // A linked recipe cannot be deleted; deleting its upload first removes the URL.
    expect(yield* violated(sql`DELETE FROM recipes WHERE id = ${recipeId}`)).toBe(
      "recipe_uploads_recipe_id_fkey",
    );
    yield* sql`DELETE FROM recipe_uploads WHERE recipe_id = ${recipeId}`;
    yield* sql`DELETE FROM recipes WHERE id = ${recipeId}`;
    expect(yield* sql`SELECT upload_id FROM recipe_upload_urls`).toEqual([]);

    // The page imports afresh, and deleting a failed upload frees it again.
    yield* insertUrl(second, page);
    yield* sql`
      UPDATE recipe_uploads SET status = 'failed', failure_code = 'page_unavailable'
      WHERE id = ${second}
    `;
    yield* sql`DELETE FROM recipe_uploads WHERE id = ${second}`;
    expect(yield* sql`SELECT upload_id FROM recipe_upload_urls`).toEqual([]);
  }).pipe(Effect.provide(DatabaseLive)),
);

// A URL of exactly `bytes` UTF-8 bytes whose last characters are `character`.
const urlOfBytes = (bytes: number, character: string) => {
  const prefix = "https://example.com/";
  const width = new TextEncoder().encode(character).length;
  const count = Math.floor((bytes - prefix.length) / width);
  const url = prefix + "a".repeat(bytes - prefix.length - count * width) + character.repeat(count);
  expect(new TextEncoder().encode(url).length).toBe(bytes);
  return url;
};

it.effect("limits submitted and normalized URLs to 2048 UTF-8 bytes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* insertUpload(first, "queued");
    for (const character of ["a", "é", "€", "😀"]) {
      const fits = urlOfBytes(2048, character);
      const over = urlOfBytes(2049, character);
      yield* insertUrl(first, fits, fits);
      yield* sql`DELETE FROM recipe_upload_urls`;
      expect(yield* violated(insertUrl(first, over, "n")), character).toBe(
        "recipe_upload_urls_url_check",
      );
      expect(yield* violated(insertUrl(first, "u", over)), character).toBe(
        "recipe_upload_urls_normalized_url_check",
      );
    }
  }).pipe(Effect.provide(DatabaseLive)),
);
