import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Postgres } from "@goho/core";
import { RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { type CreateRecipeRequest, RecipeUrl } from "@goho/goho-api/recipes";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import { SqlClient } from "effect/sql";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import * as RecipeUploadRepository from "#src/recipe-uploads/repository.ts";
import * as RecipeRepository from "#src/recipes/repository.ts";

const RepositoriesLive = Layer.mergeAll(RecipeRepository.layer, RecipeUploadRepository.layer);

// Each test owns a schema and pool, so concurrent imports use separate connections.
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

const first = RecipeUploadId.make("00000000-0000-4000-8000-000000000001");
const second = RecipeUploadId.make("00000000-0000-4000-8000-000000000002");
const third = RecipeUploadId.make("00000000-0000-4000-8000-000000000003");

class EnqueueFailed extends Schema.TaggedError<EnqueueFailed>()("EnqueueFailed", {}) {}

const source = (url: string) => ({ kind: "url", url: RecipeUrl.make(url) }) as const;

const pancakes = source("https://Example.com/recipes/pancakes?serves=4#top");

const toast: CreateRecipeRequest = {
  title: "Toast",
  ingredients: [
    { id: "bread", name: "bread", quantity: { kind: "text", text: "a slice" }, unit: null },
  ],
  steps: [{ segments: [{ kind: "text", text: "Toast it." }] }],
};

const counts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql`
    SELECT (SELECT count(*)::int FROM recipes) AS recipes,
      (SELECT count(*)::int FROM recipe_uploads) AS uploads,
      (SELECT count(*)::int FROM recipe_upload_urls) AS urls
  `;
  return row;
});

it.effect("saves a new queued import for every submission, even of one page", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploadRepository.Service;
    const created = yield* uploads.createQueued(first, pancakes);
    expect(created).toEqual({
      id: first,
      source: pancakes,
      status: "queued",
      recipeId: null,
      failureCode: null,
      createdAt: expect.any(String),
      updatedAt: created.createdAt,
    });
    expect(yield* uploads.findById(first)).toEqual(Option.some(created));

    // Another fragment or host case is the same page, but a new import with its own URL.
    const bottom = source("https://example.com/recipes/pancakes?serves=4#bottom");
    expect(yield* uploads.createQueued(second, bottom)).toMatchObject({
      id: second,
      source: bottom,
      status: "queued",
    });

    // A failed import does not hold its page.
    yield* uploads.markFailed(first, "page_unavailable");
    expect(yield* uploads.createQueued(third, pancakes)).toMatchObject({
      id: third,
      status: "queued",
    });
    expect(yield* counts).toEqual({ recipes: 0, uploads: 3, urls: 3 });
    expect((yield* uploads.list).map(({ id }) => id)).toEqual([third, second, first]);
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("commits an import, and a recipe it saves, only with the caller's transaction", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploadRepository.Service;
    const recipes = yield* RecipeRepository.Service;
    const sql = yield* SqlClient.SqlClient;

    // A job that fails to enqueue leaves no import behind.
    const enqueueFailed = yield* sql
      .withTransaction(
        uploads.createQueued(first, pancakes).pipe(Effect.andThen(new EnqueueFailed())),
      )
      .pipe(Effect.flip);
    expect(enqueueFailed).toBeInstanceOf(EnqueueFailed);
    expect(yield* counts).toEqual({ recipes: 0, uploads: 0, urls: 0 });

    // A status change that is refused rolls back the recipe saved with it.
    yield* uploads.createQueued(first, pancakes);
    const refused = yield* sql
      .withTransaction(
        recipes
          .create(toast)
          .pipe(Effect.flatMap((recipe) => uploads.markSucceeded(first, recipe.id))),
      )
      .pipe(Effect.flip);
    expect(refused).toMatchObject({
      _tag: "GohoServer.RecipeUploadRepository.InvalidTransition",
      currentStatus: "queued",
      requestedStatus: "succeeded",
    });
    expect(yield* counts).toEqual({ recipes: 0, uploads: 1, urls: 1 });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("guards each status change so a finished import keeps its outcome", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploadRepository.Service;
    const recipes = yield* RecipeRepository.Service;
    yield* uploads.createQueued(first, pancakes);
    expect(yield* uploads.markProcessing(first)).toMatchObject({ status: "processing" });
    // A retried job finds its import still processing.
    expect(yield* uploads.markProcessing(first)).toMatchObject({ status: "processing" });
    const recipe = yield* recipes.create(toast);
    const succeeded = yield* uploads.markSucceeded(first, recipe.id);
    expect(succeeded).toMatchObject({
      source: pancakes,
      status: "succeeded",
      recipeId: recipe.id,
      failureCode: null,
    });

    for (const refused of [
      uploads.markProcessing(first),
      uploads.markFailed(first, "internal_error"),
      uploads.markSucceeded(first, recipe.id),
    ]) {
      expect(yield* Effect.flip(refused)).toMatchObject({
        _tag: "GohoServer.RecipeUploadRepository.InvalidTransition",
        currentStatus: "succeeded",
      });
    }
    expect(yield* uploads.findById(first)).toEqual(Option.some(succeeded));

    // A queued import can fail before processing starts, and then stays failed.
    yield* uploads.createQueued(second, source("https://example.com/waffles"));
    expect(yield* uploads.markFailed(second, "internal_error")).toMatchObject({
      status: "failed",
      failureCode: "internal_error",
    });
    expect(yield* Effect.flip(uploads.markProcessing(second))).toMatchObject({
      currentStatus: "failed",
    });
    expect(yield* Effect.flip(uploads.markFailed(third, "internal_error"))).toMatchObject({
      _tag: "GohoServer.RecipeUploadRepository.UploadNotFound",
    });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("deletes only failed imports, with their URL", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploadRepository.Service;
    const recipes = yield* RecipeRepository.Service;
    yield* uploads.createQueued(first, pancakes);
    expect(yield* Effect.flip(uploads.deleteFailed(first))).toMatchObject({
      _tag: "GohoServer.RecipeUploadRepository.DeletionNotAllowed",
      currentStatus: "queued",
    });
    yield* uploads.markProcessing(first);
    expect(yield* Effect.flip(uploads.deleteFailed(first))).toMatchObject({
      currentStatus: "processing",
    });
    yield* uploads.createQueued(second, source("https://example.com/waffles"));
    yield* uploads.markProcessing(second);
    yield* uploads.markSucceeded(second, (yield* recipes.create(toast)).id);
    expect(yield* Effect.flip(uploads.deleteFailed(second))).toMatchObject({
      currentStatus: "succeeded",
    });
    expect(yield* Effect.flip(uploads.deleteFailed(third))).toMatchObject({
      _tag: "GohoServer.RecipeUploadRepository.UploadNotFound",
    });
    expect(yield* counts).toEqual({ recipes: 1, uploads: 2, urls: 2 });

    yield* uploads.markFailed(first, "no_recipe_found");
    yield* uploads.deleteFailed(first);
    expect(yield* uploads.findById(first)).toEqual(Option.none());
    expect(yield* counts).toEqual({ recipes: 1, uploads: 1, urls: 1 });
  }).pipe(Effect.provide(DatabaseLive)),
);

it.effect("fails to read an import whose URL is missing", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploadRepository.Service;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO recipe_uploads (id, status) VALUES (${first}, 'queued')`;
    expect(yield* Effect.flip(uploads.findById(first))).toMatchObject({
      _tag: "GohoServer.RecipeUploadRepository.PersistenceError",
      operation: "findById",
    });
    expect(yield* Effect.flip(uploads.list)).toMatchObject({ operation: "list" });
  }).pipe(Effect.provide(DatabaseLive)),
);
