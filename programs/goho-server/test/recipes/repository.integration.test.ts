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
  RecipeUploadId.make("00000000-0000-4000-8000-000000000003"),
  RecipeUploadId.make("00000000-0000-4000-8000-000000000004"),
] as const;

const pancakesUrl = RecipeUrl.make("https://Example.com/recipes/pancakes#top");
// The same page, written another way.
const samePageUrl = RecipeUrl.make("https://example.com/recipes/pancakes#method");

// A processing import of `url`.
const processing = (
  uploads: RecipeUploadRepository.Interface,
  uploadId: RecipeUploadId,
  url: RecipeUrl = pancakesUrl,
) =>
  uploads
    .createQueued(uploadId, { kind: "url", url })
    .pipe(Effect.andThen(uploads.markProcessing(uploadId)));

// A completed import of the pancakes page that linked `recipeId`.
const imported = (
  uploads: RecipeUploadRepository.Interface,
  uploadId: RecipeUploadId,
  recipeId: RecipeId,
) => processing(uploads, uploadId).pipe(Effect.andThen(uploads.markSucceeded(uploadId, recipeId)));

// Saves or finds the page's recipe and links a processing import to it in one
// transaction, as the worker does.
const importPage = (
  sql: SqlClient.SqlClient,
  recipes: RecipeRepository.Interface,
  uploads: RecipeUploadRepository.Interface,
  uploadId: RecipeUploadId,
  url: RecipeUrl,
  recipe: CreateRecipeRequest,
  image?: typeof photo,
) =>
  sql.withTransaction(
    recipes
      .findOrCreateByUrl(url, recipe, image)
      .pipe(Effect.tap(({ recipe: saved }) => uploads.markSucceeded(uploadId, saved.id))),
  );

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

    const saved = yield* recipes.create(pancakes);
    expect(saved).toEqual({
      ...pancakes,
      id: expect.stringMatching(/^[1-9]\d*$/u),
      source: null,
      hasImage: false,
      createdAt: expect.any(String),
      updatedAt: saved.createdAt,
    });
    expect(yield* recipes.findById(saved.id)).toEqual(Option.some(saved));
    expect(yield* recipes.findImage(saved.id)).toEqual(Option.none());

    // Titles are not identities, and an omitted yield and time are SQL NULL.
    const plain = yield* recipes.create(recipeTitled("Pancakes"));
    expect(plain).toMatchObject({ yield: null, totalTimeSeconds: null, hasImage: false });
    expect(plain.id).not.toBe(saved.id);
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

it.effect("lists each recipe once by title, ignoring case, with its first source", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const banana = yield* recipes.create(recipeTitled("banana bread"));
    const olderApple = yield* recipes.create(recipeTitled("Apple pie"));
    const newerApple = yield* recipes.create(recipeTitled("apple pie"));
    yield* processing(uploads, uploadIds[0]);
    const { recipe: imports } = yield* importPage(
      sql,
      recipes,
      uploads,
      uploadIds[0],
      pancakesUrl,
      pancakes,
      photo,
    );
    // A later import of the page links the same recipe; its URL does not become the source.
    yield* processing(uploads, uploadIds[1], samePageUrl);
    yield* importPage(sql, recipes, uploads, uploadIds[1], samePageUrl, recipeTitled("Other"));

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
      hasImage: false,
      createdAt: newerApple.createdAt,
      updatedAt: newerApple.updatedAt,
    });
    // The source is the first URL as submitted, fragment and case included.
    const source = { kind: "url", url: pancakesUrl };
    expect(listed[3]).toMatchObject({ source, hasImage: true, totalTimeSeconds: 1800 });
    expect(yield* recipes.findById(imports.id)).toEqual(Option.some(imports));
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("saves one recipe per normalized URL and returns it unchanged to later imports", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const saved = yield* recipes.findOrCreateByUrl(pancakesUrl, pancakes, photo);
    expect(saved).toEqual({
      created: true,
      recipe: {
        ...pancakes,
        id: expect.stringMatching(/^[1-9]\d*$/u),
        source: { kind: "url", url: pancakesUrl },
        hasImage: true,
        createdAt: expect.any(String),
        updatedAt: saved.recipe.createdAt,
      },
    });

    // The same page keeps its recipe and photo; the later content and photo are not saved.
    const otherPhoto = { fileId: FileId.make("photo-2"), contentType: "image/png" } as const;
    expect(
      yield* recipes.findOrCreateByUrl(samePageUrl, recipeTitled("Waffles"), otherPhoto),
    ).toEqual({ created: false, recipe: saved.recipe });
    expect(yield* recipes.findImage(saved.recipe.id)).toEqual(Option.some(photo));
    expect(yield* recipes.findIdByUrl(samePageUrl)).toEqual(Option.some(saved.recipe.id));

    // The query is part of the page.
    const serves = RecipeUrl.make("https://example.com/recipes/pancakes?serves=8");
    expect(yield* recipes.findIdByUrl(serves)).toEqual(Option.none());
    expect((yield* recipes.findOrCreateByUrl(serves, pancakes)).created).toBe(true);
    // A recipe saved directly has no URL, so it never matches one.
    yield* recipes.create(pancakes);
    expect(yield* counts).toEqual({ recipes: 3, uploads: 0, urls: 0 });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("gives imports racing to save one page the recipe that commits first", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    yield* processing(uploads, uploadIds[0]);
    yield* processing(uploads, uploadIds[1], samePageUrl);

    // The loser's insert waits for the winner's transaction, then finds its recipe.
    const [winner, loser] = yield* behindOpenTransaction(
      importPage(sql, recipes, uploads, uploadIds[0], pancakesUrl, pancakes),
      importPage(sql, recipes, uploads, uploadIds[1], samePageUrl, recipeTitled("Waffles"), photo),
      "INSERT INTO recipes",
    );
    expect(winner).toMatchObject({
      created: true,
      recipe: { title: "Pancakes", source: { kind: "url", url: pancakesUrl } },
    });
    expect(loser).toEqual({ created: false, recipe: winner.recipe });
    expect(yield* counts).toEqual({ recipes: 1, uploads: 2, urls: 2 });
    for (const uploadId of uploadIds.slice(0, 2)) {
      expect(yield* uploads.findById(uploadId)).toMatchObject(
        Option.some({ status: "succeeded", recipeId: winner.recipe.id }),
      );
    }
    expect(yield* recipes.findImage(winner.recipe.id)).toEqual(Option.none());
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
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("deletes an imported recipe with every upload that linked it", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    const direct = yield* recipes.create(recipeTitled("Toast"));

    yield* processing(uploads, uploadIds[0]);
    const { recipe: saved } = yield* importPage(
      sql,
      recipes,
      uploads,
      uploadIds[0],
      pancakesUrl,
      pancakes,
      photo,
    );
    yield* processing(uploads, uploadIds[1], samePageUrl);
    yield* importPage(sql, recipes, uploads, uploadIds[1], samePageUrl, pancakes);
    // Other imports of the page never linked the recipe, so they stay.
    yield* uploads.createQueued(uploadIds[2], { kind: "url", url: pancakesUrl });
    yield* uploads.markFailed(uploadIds[2], "page_unavailable");
    yield* uploads.createQueued(uploadIds[3], { kind: "url", url: samePageUrl });

    expect(yield* recipes.delete(saved.id)).toEqual(Option.some({ imageFileId: photo.fileId }));
    expect(yield* counts).toEqual({ recipes: 1, uploads: 2, urls: 2 });
    expect(
      (yield* uploads.list)
        .map(({ id, status }) => ({ id, status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      { id: uploadIds[2], status: "failed" },
      { id: uploadIds[3], status: "queued" },
    ]);
    expect(yield* recipes.delete(direct.id)).toEqual(Option.some({ imageFileId: null }));

    // The page imports afresh, though a failed attempt at it remains.
    expect(yield* recipes.findIdByUrl(pancakesUrl)).toEqual(Option.none());
    const again = yield* recipes.findOrCreateByUrl(
      RecipeUrl.make("https://example.com/recipes/pancakes"),
      pancakes,
    );
    expect(again.created).toBe(true);
    expect(again.recipe.id).not.toBe(saved.id);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("fails an import that links a recipe deleted while it waited", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const uploads = yield* RecipeUploadRepository.Service;
    const saved = yield* recipes.create(pancakes);
    yield* processing(uploads, uploadIds[0]);

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

it.effect("changes a recipe's photo one writer at a time, behind its deletion", () =>
  Effect.gen(function* () {
    const recipes = yield* RecipeRepository.Service;
    const saved = yield* recipes.create(pancakes);
    const otherPhoto = { fileId: FileId.make("photo-2"), contentType: "image/png" } as const;
    const current = recipes.findById(saved.id).pipe(Effect.map(Option.getOrThrow));

    expect(yield* recipes.setImage(saved.id, photo)).toEqual(Option.some({ previousFileId: null }));
    const withPhoto = yield* current;
    expect(withPhoto.hasImage).toBe(true);
    expect(withPhoto.updatedAt).not.toBe(saved.updatedAt);
    expect(yield* recipes.findImage(saved.id)).toEqual(Option.some(photo));

    // A waiting change sees the one that committed first, so it never returns the current file.
    const [replaced, removed] = yield* behindOpenTransaction(
      recipes.setImage(saved.id, otherPhoto),
      recipes.setImage(saved.id, null),
      "FROM recipes WHERE id",
    );
    expect(replaced).toEqual(Option.some({ previousFileId: photo.fileId }));
    expect(removed).toEqual(Option.some({ previousFileId: otherPhoto.fileId }));
    const withoutPhoto = yield* current;
    expect(withoutPhoto.hasImage).toBe(false);
    expect(yield* recipes.findImage(saved.id)).toEqual(Option.none());

    // Removing a missing photo changes nothing.
    expect(yield* recipes.setImage(saved.id, null)).toEqual(Option.some({ previousFileId: null }));
    expect(yield* current).toEqual(withoutPhoto);

    const [deleted, set] = yield* behindOpenTransaction(
      recipes.delete(saved.id),
      recipes.setImage(saved.id, photo),
      "FROM recipes WHERE id",
    );
    expect(deleted).toEqual(Option.some({ imageFileId: null }));
    expect(set).toEqual(Option.none());
    expect(yield* counts).toEqual({ recipes: 0, uploads: 0, urls: 0 });
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
