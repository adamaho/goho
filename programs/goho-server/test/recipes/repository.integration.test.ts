import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { type CreateRecipeRequest, RecipeId, RecipeUrl } from "@goho/goho-api/recipes";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { SecureRandom } from "effect/crypto";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import * as RecipeUploadRepository from "#src/recipe-uploads/repository.ts";
import * as RecipeRepository from "#src/recipes/repository.ts";
import { FileId } from "#src/services/file-storage.ts";
import { behindOpenTransaction } from "#test/helpers/locks.ts";

const RepositoriesLive = Layer.mergeAll(RecipeRepository.layer, RecipeUploadRepository.layer);

// Each test owns a schema and pool, so concurrent work uses separate connections.
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
    const services = yield* Layer.build(
      RepositoriesLive.pipe(
        Layer.provideMerge(Postgres.layer({ url: Redacted.make(testUrl.toString()) })),
      ),
    );
    yield* Migrations.run().pipe(Effect.provide(services), Effect.provide(NodeServices.layer));
    return services;
  }),
).pipe(Layer.provide(NodeCrypto.layer));

const pancakes = {
  title: "Pancakes",
  ingredients: [
    {
      id: "flour",
      name: "all-purpose flour",
      quantity: { kind: "exact", value: { numerator: 3, denominator: 2 } },
      unit: "cup",
    },
    {
      id: "milk",
      name: "milk",
      quantity: {
        kind: "range",
        min: { numerator: 1, denominator: 1 },
        max: { numerator: Number.MAX_SAFE_INTEGER, denominator: 3 },
      },
      unit: "cup",
    },
    { id: "salt", name: "salt", quantity: { kind: "text", text: "to taste" }, unit: null },
  ],
  steps: [
    {
      segments: [
        { kind: "text", text: "Whisk " },
        {
          kind: "mark",
          content: {
            kind: "ingredient",
            ingredientId: "flour",
            portion: { numerator: 1, denominator: 2 },
          },
        },
        { kind: "text", text: " with " },
        {
          kind: "mark",
          content: {
            kind: "ingredient",
            ingredientId: "milk",
            portion: { numerator: 1, denominator: 1 },
          },
        },
        { kind: "text", text: ",  then add " },
        { kind: "mark", content: { kind: "text", text: " a pinch " } },
        { kind: "text", text: "." },
      ],
    },
    { segments: [{ kind: "text", text: "Cook until golden. " }] },
  ],
  yield: {
    quantity: { kind: "exact", value: { numerator: 4, denominator: 1 } },
    label: "servings",
  },
  totalTimeSeconds: 1800,
} satisfies CreateRecipeRequest;

const recipeTitled = (title: string): CreateRecipeRequest => ({
  title,
  ingredients: [pancakes.ingredients[2]],
  steps: [{ segments: [{ kind: "text", text: "Mix." }] }],
});

const photo = { fileId: FileId.make("photo-1"), contentType: "image/webp" } as const;

const uploadIds = [
  RecipeUploadId.make("00000000-0000-4000-8000-000000000001"),
  RecipeUploadId.make("00000000-0000-4000-8000-000000000002"),
] as const;

const pancakesUrl = RecipeUrl.make("https://Example.com/recipes/pancakes#top");

// A completed import of the pancakes page that saved `recipeId`.
const imported = (
  uploads: RecipeUploadRepository.Interface,
  uploadId: RecipeUploadId,
  recipeId: RecipeId,
) =>
  Effect.gen(function* () {
    yield* uploads.findOrCreateQueued(uploadId, { kind: "url", url: pancakesUrl });
    yield* uploads.markProcessing(uploadId);
    return yield* uploads.markSucceeded(uploadId, recipeId);
  });

const counts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql`
    SELECT (SELECT count(*)::int FROM recipes) AS recipes,
      (SELECT count(*)::int FROM recipe_uploads) AS uploads,
      (SELECT count(*)::int FROM recipe_upload_urls) AS urls
  `;
  return row;
});

it.effect("saves a direct recipe and reads it back exactly", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const sql = yield* SqlClient.SqlClient;

    const saved = yield* recipes.create(pancakes, photo);
    expect(saved).toEqual({
      ...pancakes,
      id: expect.stringMatching(/^[1-9]\d*$/u),
      source: null,
      hasImage: true,
      createdAt: expect.any(String),
      updatedAt: saved.createdAt,
    });
    expect(yield* recipes.findById(saved.id)).toEqual(Option.some(saved));
    expect(yield* recipes.findImage(saved.id)).toEqual(Option.some(photo));

    // Titles are not identities, and an omitted yield and time are SQL NULL.
    const plain = yield* recipes.create(recipeTitled("Pancakes"));
    expect(plain).toMatchObject({ yield: null, totalTimeSeconds: null, hasImage: false });
    expect(plain.id).not.toBe(saved.id);
    expect(yield* recipes.findImage(plain.id)).toEqual(Option.none());
    expect(
      yield* sql`
        SELECT jsonb_typeof(ingredients) AS ingredients, jsonb_typeof(steps) AS steps,
          "yield" IS NULL AS "noYield"
        FROM recipes ORDER BY id
      `,
    ).toEqual([
      { ingredients: "array", steps: "array", noYield: false },
      { ingredients: "array", steps: "array", noYield: true },
    ]);

    const missing = RecipeId.make("9223372036854775807");
    expect(yield* recipes.findById(missing)).toEqual(Option.none());
    expect(yield* recipes.findImage(missing)).toEqual(Option.none());
    expect(yield* recipes.delete(missing)).toEqual(Option.none());
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("lists summaries by title, ignoring case, with each import's source", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const banana = yield* recipes.create(recipeTitled("banana bread"));
    const olderApple = yield* recipes.create(recipeTitled("Apple pie"));
    const newerApple = yield* recipes.create(recipeTitled("apple pie"), photo);
    const imports = yield* recipes.create(pancakes);
    yield* imported(yield* RecipeUploadRepository.Service, uploadIds[0], imports.id);

    const listed = yield* recipes.list;
    expect(listed.map(({ id }) => id)).toEqual([
      newerApple.id,
      olderApple.id,
      banana.id,
      imports.id,
    ]);
    // Summaries leave out the recipe body.
    expect(listed[0]).toEqual({
      id: newerApple.id,
      title: "apple pie",
      source: null,
      totalTimeSeconds: null,
      hasImage: true,
      createdAt: newerApple.createdAt,
      updatedAt: newerApple.updatedAt,
    });
    // The source is the URL as submitted, fragment and case included.
    const source = { kind: "url", url: pancakesUrl };
    expect(listed[3]).toMatchObject({ source, hasImage: false, totalTimeSeconds: 1800 });
    expect(yield* recipes.findById(imports.id)).toEqual(Option.some({ ...imports, source }));
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("fails to read stored recipes that no longer decode", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const saved = yield* recipes.create(pancakes);
    // The database checks only top-level shapes, so a dangling step mark gets in.
    yield* sql`
      UPDATE recipes
      SET ingredients = jsonb_build_array(ingredients -> 2)
      WHERE id = ${saved.id}
    `;
    const failure = yield* recipes.findById(saved.id).pipe(Effect.flip);
    expect(failure).toMatchObject({
      _tag: "GohoServer.RecipeRepository.PersistenceError",
      operation: "findById",
    });
    // The summary does not read the body, so the listing still works.
    expect((yield* recipes.list).map(({ id }) => id)).toEqual([saved.id]);

    // A linked import without its URL fails instead of hiding the source.
    yield* sql`
      INSERT INTO recipe_uploads (id, status, recipe_id)
      VALUES (${uploadIds[0]}, 'succeeded', ${saved.id})
    `;
    expect(yield* recipes.list.pipe(Effect.flip)).toMatchObject({ operation: "list" });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("deletes an imported recipe with its upload so the page can be imported again", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const direct = yield* recipes.create(recipeTitled("Toast"));

    yield* uploads.findOrCreateQueued(uploadIds[0], { kind: "url", url: pancakesUrl });
    yield* uploads.markProcessing(uploadIds[0]);
    const saved = yield* sql.withTransaction(
      Effect.gen(function* () {
        const recipe = yield* recipes.create(pancakes, photo);
        yield* uploads.markSucceeded(uploadIds[0], recipe.id);
        return recipe;
      }),
    );

    expect(yield* recipes.delete(saved.id)).toEqual(Option.some({ imageFileId: photo.fileId }));
    expect(yield* counts).toEqual({ recipes: 1, uploads: 0, urls: 0 });
    expect(yield* recipes.delete(direct.id)).toEqual(Option.some({ imageFileId: null }));

    const again = yield* uploads.findOrCreateQueued(uploadIds[1], {
      kind: "url",
      url: RecipeUrl.make("https://example.com/recipes/pancakes"),
    });
    expect(again).toMatchObject({ created: true, upload: { id: uploadIds[1], status: "queued" } });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("fails an import that links a recipe deleted while it waited", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const saved = yield* recipes.create(pancakes);
    yield* uploads.findOrCreateQueued(uploadIds[0], { kind: "url", url: pancakesUrl });
    yield* uploads.markProcessing(uploadIds[0]);

    const [deleted, linked] = yield* behindOpenTransaction(
      recipes.delete(saved.id),
      uploads.markSucceeded(uploadIds[0], saved.id).pipe(Effect.result),
      "FROM recipes WHERE id",
    );
    expect(deleted).toEqual(Option.some({ imageFileId: null }));
    expect(linked).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "GohoServer.RecipeUploadRepository.PersistenceError" },
    });
    expect(yield* uploads.findById(uploadIds[0])).toMatchObject(
      Option.some({ status: "processing", recipeId: null }),
    );
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("deletes the upload that linked a recipe while its deletion waited", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const saved = yield* recipes.create(pancakes);

    const [linked, deleted] = yield* behindOpenTransaction(
      imported(uploads, uploadIds[0], saved.id),
      recipes.delete(saved.id),
      "FROM recipes WHERE id",
    );
    expect(linked).toMatchObject({ status: "succeeded", recipeId: saved.id });
    expect(deleted).toEqual(Option.some({ imageFileId: null }));
    expect(yield* counts).toEqual({ recipes: 0, uploads: 0, urls: 0 });
  }).pipe(Effect.provide(DatabaseLive)),
);
