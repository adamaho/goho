import { NodeCrypto, NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { RecipeUpload, RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { RecipeId, RecipeNotFound, RecipeUrl } from "@goho/goho-api/recipes";
import * as Client from "@goho/goho-server-client/client";
import {
  Config,
  Context,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Option,
  Redacted,
  Ref,
  Result,
  Schema,
} from "effect";
import { SecureRandom } from "effect/crypto";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { PersistedQueue } from "effect/persistence";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as Http from "#src/http/routes.ts";
import * as QueueConstants from "#src/queues/constants.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";
import * as RecipeUploadQueue from "#src/recipe-uploads/queue.ts";
import * as RecipeUploadRepository from "#src/recipe-uploads/repository.ts";
import * as RecipeUploads from "#src/recipe-uploads/service.ts";
import * as Worker from "#src/recipe-uploads/worker.ts";
import * as RecipeRepository from "#src/recipes/repository.ts";
import * as Recipes from "#src/recipes/service.ts";
import * as FileStorage from "#src/services/file-storage.ts";
import * as WebFetch from "#src/services/web-fetch.ts";
import { generateObject } from "#test/receipts/fixtures.ts";

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

const pageUrl = "https://recipes.example/toast";
const photoUrl = "https://recipes.example/toast.png";
const source = { kind: "url", url: RecipeUrl.make(`${pageUrl}#top`) } as const;
// The same page, submitted another way.
const samePage = { kind: "url", url: RecipeUrl.make(`${pageUrl}#method`) } as const;

const page = `<html><head><meta property="og:image" content="${photoUrl}"></head>
<body><h1>Toast</h1><p>Toast two slices of bread.</p></body></html>`;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const toast = {
  title: "Toast",
  ingredients: [
    {
      id: "bread",
      name: "bread",
      quantity: { kind: "exact", value: { numerator: 2, denominator: 1 } },
      unit: "count",
    },
  ],
  steps: [
    {
      segments: [
        { kind: "text", text: "Toast " },
        {
          kind: "mark",
          content: {
            kind: "ingredient",
            ingredientId: "bread",
            portion: { numerator: 1, denominator: 1 },
          },
        },
        { kind: "text", text: "." },
      ],
    },
  ],
  yield: null,
  totalTimeSeconds: 300,
} as const;

type Fetch = WebFetch.Interface["get"];

// The page is fetched as submitted, fragment included.
const served: Fetch = (request) =>
  request.url === source.url || request.url === samePage.url
    ? Effect.succeed({ url: new URL(pageUrl), contentType: "text/html", body: Buffer.from(page) })
    : request.url === photoUrl
      ? Effect.succeed({ url: new URL(photoUrl), contentType: "image/png", body: png })
      : Effect.die(`Unexpected fetch of ${request.url}`);

const unavailable = new WebFetch.FetchError({ reason: "status", retryable: true, cause: "503" });

// What the fake site, model and storage do on the next call. The model runs the
// current answer, so a test can also act while an import is in flight.
class Fakes extends Context.Service<
  Fakes,
  {
    readonly fetch: Ref.Ref<Fetch>;
    readonly answer: Ref.Ref<Effect.Effect<unknown>>;
    readonly modelCalls: Ref.Ref<number>;
    readonly puts: Ref.Ref<number>;
    readonly failPut: Ref.Ref<boolean>;
    readonly directory: string;
  }
>()("@goho/goho-server/Test/RecipeImportFakes") {}

const FakesLive = Layer.effectContext(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "goho-recipe-uploads-test-" });
    const storage = yield* FileStorage.Service.pipe(
      Effect.provide(FileStorage.layerFileSystem({ directory })),
    );
    const fakes = Fakes.of({
      fetch: yield* Ref.make(served),
      answer: yield* Ref.make<Effect.Effect<unknown>>(
        Effect.succeed({ result: { kind: "recipe", recipe: toast } }),
      ),
      modelCalls: yield* Ref.make(0),
      puts: yield* Ref.make(0),
      failPut: yield* Ref.make(false),
      directory,
    });
    return Context.empty().pipe(
      Context.add(Fakes, fakes),
      Context.add(WebFetch.Service, {
        get: (request) => Ref.get(fakes.fetch).pipe(Effect.flatMap((fetch) => fetch(request))),
      }),
      Context.add(Ai.Service, {
        generateObject: (options) =>
          Ref.update(fakes.modelCalls, (calls) => calls + 1).pipe(
            Effect.andThen(Ref.get(fakes.answer)),
            Effect.flatten,
            Effect.flatMap((output) => generateObject(output)(options)),
          ),
      }),
      Context.add(FileStorage.Service, {
        ...storage,
        put: (file) =>
          Ref.update(fakes.puts, (puts) => puts + 1).pipe(
            Effect.andThen(Ref.get(fakes.failPut)),
            Effect.flatMap((fail) =>
              fail
                ? Effect.fail(
                    new FileStorage.StorageError({ operation: "put", cause: "disk full" }),
                  )
                : storage.put(file),
            ),
          ),
      }),
    );
  }),
).pipe(Layer.provide([NodeServices.layer, NodeCrypto.layer]));

const InfrastructureLive = Layer.mergeAll(
  RecipeRepository.layer,
  RecipeUploadRepository.layer,
  RecipeUploadQueue.layer,
  Transaction.layer,
  FakesLive,
  NodeCrypto.layer,
  NodeServices.layer,
);

const TestLive = Layer.mergeAll(RecipeUploads.layer, Recipes.layer).pipe(
  Layer.provideMerge(InfrastructureLive),
  Layer.provideMerge(DatabaseLive),
);

const attempt = (uploadId: RecipeUploadId, attempts = 1) =>
  Worker.process({ uploadId }, { id: uploadId, attempts });

const submitSource = (submitted: typeof source | typeof samePage) =>
  RecipeUploads.Service.use((uploads) => uploads.create(submitted));

const submit = submitSource(source);

// The tag an effect fails with, or "succeeded".
const failureTag = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.result(effect).pipe(
    Effect.map((result) => (Result.isFailure(result) ? result.failure._tag : "succeeded")),
  );

const jobStates = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly id: string; readonly state: string }>`
    SELECT id, state FROM ${sql(QueueConstants.tableName)}
    WHERE queue_name = ${RecipeUploadQueue.name} ORDER BY id
  `;
  return rows.map(({ id, state }) => ({ id, state }));
});

const recipeRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`SELECT * FROM recipes ORDER BY id`;
});

const storedFiles = Fakes.use((fakes) =>
  FileSystem.FileSystem.use((fs) => fs.readDirectory(fakes.directory)),
);

const recipeIdOf = (uploadId: RecipeUploadId) =>
  statusOf(uploadId).pipe(
    Effect.map(({ recipeId }) => Option.getOrThrow(Option.fromNullishOr(recipeId))),
  );

const statusOf = (uploadId: RecipeUploadId) =>
  RecipeUploads.Service.use((uploads) => uploads.get(uploadId)).pipe(
    Effect.map(({ status, failureCode, recipeId }) => ({ status, failureCode, recipeId })),
  );

it.effect("queues a new import and job for every submission of a page", () =>
  Effect.gen(function* () {
    const first = yield* submit;
    expect(first).toMatchObject({ source, status: "queued" });

    // Another fragment is the same page, but a new import with its own source and job.
    const again = yield* submitSource(samePage);
    expect(again).toMatchObject({ source: samePage, status: "queued" });
    expect(again.id).not.toBe(first.id);
    expect(yield* jobStates).toEqual(
      [first.id, again.id].sort().map((id) => ({ id, state: "pending" })),
    );
  }).pipe(Effect.provide(TestLive)),
);

it.effect("saves neither the import nor its job when the job cannot be queued", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploads.Service.pipe(
      Effect.provide(
        Layer.fresh(RecipeUploads.layer).pipe(
          Layer.provide(
            Layer.succeed(RecipeUploadQueue.Service, {
              offer: () =>
                Effect.fail(
                  new PersistedQueue.PersistedQueueError({ message: "queue unavailable" }),
                ),
              take: () => Effect.die("Unexpected queue.take call"),
            }),
          ),
        ),
      ),
    );
    expect(yield* failureTag(uploads.create(source))).toBe("RecipeUploadsUnavailable");
    expect(yield* RecipeUploadRepository.Service.use((repo) => repo.list)).toEqual([]);
    expect(yield* jobStates).toEqual([]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("imports a queued page with its photo once, whatever is redelivered", () =>
  Effect.gen(function* () {
    const recipes = yield* Recipes.Service;
    const queue = yield* RecipeUploadQueue.Service;
    const upload = yield* submit;

    yield* queue.take(Worker.process);

    const done = yield* statusOf(upload.id);
    expect(done).toMatchObject({ status: "succeeded", failureCode: null });
    const recipeId = Option.getOrThrow(Option.fromNullishOr(done.recipeId));
    // The source is the URL as first submitted, fragment included.
    expect(yield* recipes.get(recipeId)).toMatchObject({
      title: "Toast",
      source,
      hasImage: true,
      yield: null,
      totalTimeSeconds: 300,
    });
    const photo = yield* recipes.getImage(recipeId);
    expect([new Uint8Array(photo.bytes), photo.contentType]).toEqual([png, "image/png"]);
    expect(yield* jobStates).toEqual([{ id: upload.id, state: "completed" }]);

    // A delivery after success changes nothing and does no work.
    const before = yield* Effect.all([recipeRows, storedFiles]);
    yield* attempt(upload.id, 2);
    expect(yield* Effect.all([recipeRows, storedFiles])).toEqual(before);
    expect(yield* Fakes.use((fakes) => Ref.get(fakes.modelCalls))).toBe(1);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("retries a temporary failure and saves the recipe on a later attempt", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const upload = yield* submit;
    yield* Ref.set(fakes.fetch, () => Effect.fail(unavailable));

    const first = yield* attempt(upload.id).pipe(Effect.result);
    expect(Result.isFailure(first) && first.failure.failureCode).toBe("page_unavailable");
    expect(yield* statusOf(upload.id)).toEqual({
      status: "processing",
      failureCode: null,
      recipeId: null,
    });

    yield* Ref.set(fakes.fetch, served);
    yield* attempt(upload.id, 2);
    expect((yield* statusOf(upload.id)).status).toBe("succeeded");
    expect(yield* recipeRows).toHaveLength(1);
  }).pipe(Effect.provide(TestLive)),
);

it.live(
  "fails an import whose temporary failure lasts through the third attempt",
  () =>
    Effect.gen(function* () {
      const fakes = yield* Fakes;
      const queue = yield* RecipeUploadQueue.Service;
      const attempts = yield* Ref.make<ReadonlyArray<number>>([]);
      const upload = yield* submit;
      yield* Ref.set(fakes.fetch, () => Effect.fail(unavailable));
      const take = queue.take((job, metadata) =>
        Ref.update(attempts, (seen) => [...seen, metadata.attempts]).pipe(
          Effect.andThen(Worker.process(job, metadata)),
        ),
      );

      // The queue redelivers after its retry delay; there is no fourth attempt.
      for (let index = 0; index < QueueConstants.maxAttempts; index++) {
        yield* take.pipe(Effect.result);
      }

      expect(yield* Ref.get(attempts)).toEqual([1, 2, 3]);
      expect(yield* statusOf(upload.id)).toEqual({
        status: "failed",
        failureCode: "page_unavailable",
        recipeId: null,
      });
      expect(yield* jobStates).toEqual([{ id: upload.id, state: "failed" }]);
    }).pipe(Effect.provide(TestLive)),
  20_000,
);

it.effect("fails an import the page rejects on the first attempt without a retry", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const queue = yield* RecipeUploadQueue.Service;
    const upload = yield* submit;
    yield* Ref.set(fakes.answer, Effect.succeed({ result: { kind: "ambiguous_recipe" } }));

    yield* queue.take(Worker.process);

    expect(yield* statusOf(upload.id)).toEqual({
      status: "failed",
      failureCode: "ambiguous_recipe",
      recipeId: null,
    });
    // The delivery completes, so the queue never retries it.
    expect(yield* jobStates).toEqual([{ id: upload.id, state: "completed" }]);
    expect(yield* Ref.get(fakes.modelCalls)).toBe(1);
    expect(yield* recipeRows).toEqual([]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("saves the recipe without its photo when the photo cannot be stored", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const recipes = yield* Recipes.Service;
    const upload = yield* submit;
    yield* Ref.set(fakes.failPut, true);

    yield* attempt(upload.id);

    const { status, recipeId } = yield* statusOf(upload.id);
    expect(status).toBe("succeeded");
    const saved = yield* recipes.get(Option.getOrThrow(Option.fromNullishOr(recipeId)));
    expect(saved.hasImage).toBe(false);
    expect(yield* storedFiles).toEqual([]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("removes the stored photo and the recipe when the upload stops processing", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const repo = yield* RecipeUploadRepository.Service;
    const upload = yield* submit;
    // Recovery fails the upload while the model reads the page, so the save is refused.
    yield* Ref.set(
      fakes.answer,
      repo
        .markFailed(upload.id, "internal_error")
        .pipe(Effect.orDie, Effect.as({ result: { kind: "recipe", recipe: toast } })),
    );

    const result = yield* attempt(upload.id).pipe(Effect.result);

    expect(Result.isFailure(result) && result.failure.failureCode).toBe("internal_error");
    expect(yield* recipeRows).toEqual([]);
    expect(yield* storedFiles).toEqual([]);
    expect((yield* statusOf(upload.id)).failureCode).toBe("internal_error");
  }).pipe(Effect.provide(TestLive)),
);

it.effect("fails recipe imports their queue abandoned and leaves other queues' jobs alone", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const repo = yield* RecipeUploadRepository.Service;
    // Seeds what a crash during the final attempt leaves: the job failed, the upload did not.
    const abandoned = yield* submit;
    yield* repo.markProcessing(abandoned.id);
    yield* sql`
      UPDATE ${sql(QueueConstants.tableName)} SET state = 'failed'
      WHERE queue_name = ${RecipeUploadQueue.name} AND id = ${abandoned.id}
    `;
    // Only a book job with this ID failed; the import has no failed recipe job.
    const unrelated = RecipeUploadId.make("00000000-0000-4000-8000-000000000001");
    yield* repo.createQueued(unrelated, {
      kind: "url",
      url: RecipeUrl.make("https://recipes.example/other"),
    });
    yield* sql`
      INSERT INTO ${sql(QueueConstants.tableName)}
        (id, queue_name, element, state, attempts, visible_at, created_at, updated_at)
      VALUES (${unrelated}, 'book-uploads', '{}', 'failed', 3, NOW(), NOW(), NOW())
    `;

    yield* Layer.build(Worker.layer);
    // Recovery runs at startup and then on its schedule, so the import settles.
    const settled = yield* TestClock.adjust("30 seconds").pipe(
      Effect.andThen(statusOf(abandoned.id)),
      Effect.repeat({ until: ({ status }) => status !== "processing", times: 10 }),
    );

    expect(settled).toEqual({ status: "failed", failureCode: "internal_error", recipeId: null });
    expect((yield* statusOf(unrelated)).status).toBe("queued");
  }).pipe(Effect.provide(TestLive)),
);

it.effect("links a later import of a saved page without fetching it again", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const recipes = yield* Recipes.Service;
    const first = yield* submit;
    yield* attempt(first.id);
    const recipeId = yield* recipeIdOf(first.id);
    const saved = yield* recipes.get(recipeId);
    const files = yield* storedFiles;

    // Neither the site, the model nor storage is used again.
    yield* Ref.set(fakes.fetch, (request) => Effect.die(`Unexpected fetch of ${request.url}`));
    const later = yield* submitSource(samePage);
    yield* attempt(later.id);

    expect(yield* statusOf(later.id)).toEqual({ status: "succeeded", failureCode: null, recipeId });
    expect([yield* Ref.get(fakes.modelCalls), yield* Ref.get(fakes.puts)]).toEqual([1, 1]);
    // The recipe, its photo and its first source stay as they were.
    expect(yield* recipes.get(recipeId)).toEqual(saved);
    expect(saved.source).toEqual(source);
    expect(yield* storedFiles).toEqual(files);
    expect((yield* recipes.list).map(({ id }) => id)).toEqual([recipeId]);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("imports a page again after an earlier import of it failed", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const failed = yield* submit;
    yield* Ref.set(fakes.answer, Effect.succeed({ result: { kind: "no_recipe_found" } }));
    yield* attempt(failed.id);
    expect((yield* statusOf(failed.id)).failureCode).toBe("no_recipe_found");

    // The failed import need not be deleted first.
    yield* Ref.set(fakes.answer, Effect.succeed({ result: { kind: "recipe", recipe: toast } }));
    const retried = yield* submit;
    yield* attempt(retried.id);
    expect((yield* statusOf(retried.id)).status).toBe("succeeded");
    expect((yield* statusOf(failed.id)).status).toBe("failed");
    expect(yield* Ref.get(fakes.modelCalls)).toBe(2);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("saves one recipe when imports of one page run at once", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const recipes = yield* Recipes.Service;
    const first = yield* submit;
    const second = yield* submitSource(samePage);
    // Each model call waits for the other, so both jobs miss the saved-recipe lookup.
    const bothAsked = yield* Deferred.make<void>();
    yield* Ref.set(
      fakes.answer,
      Ref.get(fakes.modelCalls).pipe(
        Effect.flatMap((calls) =>
          calls >= 2 ? Deferred.succeed(bothAsked, undefined) : Effect.void,
        ),
        Effect.andThen(Deferred.await(bothAsked)),
        Effect.as({ result: { kind: "recipe", recipe: toast } }),
      ),
    );

    yield* Effect.all([attempt(first.id), attempt(second.id)], { concurrency: "unbounded" });

    const recipeId = yield* recipeIdOf(first.id);
    expect(yield* recipeIdOf(second.id)).toBe(recipeId);
    expect(yield* recipeRows).toHaveLength(1);
    expect([yield* Ref.get(fakes.modelCalls), yield* Ref.get(fakes.puts)]).toEqual([2, 2]);
    // The losing job's photo is removed; the recipe keeps the winner's photo and URL.
    expect(yield* storedFiles).toHaveLength(1);
    const saved = yield* recipes.get(recipeId);
    expect(saved.hasImage).toBe(true);
    expect([source, samePage]).toContainEqual(saved.source);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("saves a recipe directly without an import, job or source", () =>
  Effect.gen(function* () {
    const recipes = yield* Recipes.Service;
    const { yield: _, ...request } = toast;

    const saved = yield* recipes.create(request);

    expect(saved).toMatchObject({ title: "Toast", source: null, hasImage: false, yield: null });
    expect(yield* recipes.get(saved.id)).toEqual(saved);
    // Titles are not identities, so the same recipe saved again is another one.
    const repeated = yield* recipes.create(request);
    expect(repeated.id).not.toBe(saved.id);
    expect((yield* recipes.list).map(({ id }) => id)).toEqual([repeated.id, saved.id]);
    expect(yield* RecipeUploadRepository.Service.use((repo) => repo.list)).toEqual([]);
    expect(yield* jobStates).toEqual([]);
    expect(yield* Fakes.use((fakes) => Ref.get(fakes.modelCalls))).toBe(0);
    expect(yield* failureTag(recipes.getImage(saved.id))).toBe("RecipeImageNotFound");
  }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes an imported recipe with its imports and photo, so the page imports again", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const recipes = yield* Recipes.Service;
    const first = yield* submit;
    yield* attempt(first.id);
    const later = yield* submitSource(samePage);
    yield* attempt(later.id);
    const recipeId = yield* recipeIdOf(first.id);
    expect(yield* recipeIdOf(later.id)).toBe(recipeId);
    expect(yield* storedFiles).toHaveLength(1);

    yield* recipes.delete(recipeId);

    expect(yield* storedFiles).toEqual([]);
    expect(yield* failureTag(recipes.get(recipeId))).toBe("RecipeNotFound");
    expect(yield* failureTag(recipes.getImage(recipeId))).toBe("RecipeImageNotFound");
    expect(yield* failureTag(recipes.delete(recipeId))).toBe("RecipeNotFound");
    expect(yield* failureTag(statusOf(first.id))).toBe("RecipeUploadNotFound");
    expect(yield* failureTag(statusOf(later.id))).toBe("RecipeUploadNotFound");

    // A new submission imports the page into a new recipe.
    const again = yield* submit;
    yield* attempt(again.id);
    expect(yield* recipeIdOf(again.id)).not.toBe(recipeId);
    expect(yield* Ref.get(fakes.modelCalls)).toBe(2);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes only a failed import", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploads.Service;
    const repo = yield* RecipeUploadRepository.Service;
    const upload = yield* submit;

    expect(yield* failureTag(uploads.delete(upload.id))).toBe("RecipeUploadConflict");
    yield* repo.markFailed(upload.id, "page_unavailable");
    yield* uploads.delete(upload.id);

    expect(yield* failureTag(uploads.get(upload.id))).toBe("RecipeUploadNotFound");
    expect(yield* failureTag(uploads.delete(upload.id))).toBe("RecipeUploadNotFound");
  }).pipe(Effect.provide(TestLive)),
);

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

it.effect("keeps one photo file per recipe through racing and failed photo changes", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const recipes = yield* Recipes.Service;
    const { id } = yield* recipes.create(toast);
    const photoOf = recipes
      .getImage(id)
      .pipe(Effect.map(({ bytes, contentType }) => [new Uint8Array(bytes), contentType]));

    // Both land; the one committed last wins and the other's file is removed.
    const outcomes = yield* Effect.all(
      [
        recipes.putImage(id, { bytes: png, contentType: "image/png" }),
        recipes.putImage(id, { bytes: jpeg, contentType: "image/jpeg" }),
      ],
      { concurrency: "unbounded" },
    );
    expect([...outcomes].sort()).toEqual(["created", "replaced"]);
    expect(yield* photoOf).toEqual(
      outcomes[0] === "replaced" ? [png, "image/png"] : [jpeg, "image/jpeg"],
    );
    expect(yield* storedFiles).toHaveLength(1);

    // A photo that cannot be stored leaves the current one in place.
    const before = yield* Effect.all([photoOf, storedFiles, recipes.get(id)]);
    yield* Ref.set(fakes.failPut, true);
    expect(yield* failureTag(recipes.putImage(id, { bytes: png, contentType: "image/png" }))).toBe(
      "RecipesUnavailable",
    );
    expect(yield* Effect.all([photoOf, storedFiles, recipes.get(id)])).toEqual(before);
  }).pipe(Effect.provide(TestLive)),
);

// The routes over the real recipe services, queue, and database.
const HttpLive = HttpRouter.serve(
  Http.layer.pipe(
    Layer.provide([
      Layer.mock(Books.Service, {}),
      Layer.mock(BookUploads.Service, {}),
      Layer.mock(Receipts.Service, {}),
      Layer.mock(ReceiptUploads.Service, {}),
    ]),
  ),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(TestLive));

const decodeUpload = Schema.decodeUnknownEffect(Schema.Struct({ data: RecipeUpload }));

it.effect("imports, serves, and deletes recipes over HTTP", () =>
  Effect.gen(function* () {
    const fakes = yield* Fakes;
    const client = yield* Client.make("");
    const queue = yield* RecipeUploadQueue.Service;
    const body = yield* HttpBody.json({ source });

    const accepted = yield* HttpClient.post("/recipe-uploads", { body });
    expect(accepted.status).toBe(202);
    const { data: first } = yield* accepted.json.pipe(Effect.flatMap(decodeUpload));
    expect(first).toMatchObject({ source, status: "queued", recipeId: null });

    // Every submission of a page is a new import with its own job.
    const { data: second } = yield* client.recipeUploads.create({
      payload: { source: samePage },
    });
    expect(second).toMatchObject({ source: samePage, status: "queued", recipeId: null });
    expect(second.id).not.toBe(first.id);
    const jobs = yield* jobStates;
    expect(jobs).toHaveLength(2);
    expect(jobs).toEqual(
      expect.arrayContaining([
        { id: first.id, state: "pending" },
        { id: second.id, state: "pending" },
      ]),
    );

    // The first job saves the recipe; the second links it without the model.
    yield* queue.take(Worker.process);
    yield* queue.take(Worker.process);
    const { data: uploads } = yield* client.recipeUploads.list();
    expect(uploads.map(({ id, status }) => [id, status])).toEqual([
      [second.id, "succeeded"],
      [first.id, "succeeded"],
    ]);
    const recipeId = Option.getOrThrow(Option.fromNullishOr(uploads[0]?.recipeId));
    expect(uploads[1]?.recipeId).toBe(recipeId);
    expect(yield* Ref.get(fakes.modelCalls)).toBe(1);
    const { data: imported } = yield* client.recipes.get({ params: { recipeId } });
    expect(imported).toMatchObject({ ...toast, id: recipeId, source, hasImage: true });
    const photo = yield* HttpClient.get(`/recipes/${recipeId}/image`);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/png");
    expect(new Uint8Array(yield* photo.arrayBuffer)).toEqual(png);

    // Direct saves skip the queue, and a repeated title is another recipe.
    const direct = { ...toast, title: "apple toast" };
    const created = yield* HttpClient.post("/recipes", { body: yield* HttpBody.json(direct) });
    expect(created.status).toBe(200);
    const { data: again } = yield* client.recipes.create({ payload: direct });
    expect(again).toMatchObject({ ...direct, source: null, hasImage: false });
    expect(yield* jobStates).toHaveLength(2);
    const { data: summaries } = yield* client.recipes.list();
    expect(summaries.map(({ title, source }) => [title, source])).toEqual([
      ["apple toast", null],
      ["apple toast", null],
      ["Toast", source],
    ]);
    expect(summaries[0]).toEqual({
      id: again.id,
      title: again.title,
      source: null,
      totalTimeSeconds: 300,
      hasImage: false,
      createdAt: again.createdAt,
      updatedAt: again.updatedAt,
    });
    const noPhoto = yield* HttpClient.get(`/recipes/${again.id}/image`);
    expect([noPhoto.status, yield* noPhoto.json]).toEqual([
      404,
      { type: "goho:problem:recipe-image-not-found", status: 404, title: "Recipe image not found" },
    ]);

    // Deleting the imported recipe takes both imports and the photo.
    expect((yield* HttpClient.del(`/recipes/${recipeId}`)).status).toBe(204);
    const gone = yield* client.recipes.get({ params: { recipeId } }).pipe(Effect.flip);
    expect(gone).toBeInstanceOf(RecipeNotFound);
    for (const { id } of [first, second]) {
      expect((yield* HttpClient.get(`/recipe-uploads/${id}`)).status).toBe(404);
    }
    expect(yield* storedFiles).toEqual([]);
  }).pipe(Effect.provide(HttpLive)),
);

const photoForm = (file: File, field = "file") => {
  const form = new FormData();
  form.append(field, file);
  return form;
};

// A live clock, as the oversized upload streams through a real socket.
it.live(
  "sets, replaces, serves, and removes recipe photos over HTTP",
  () =>
    Effect.gen(function* () {
      const client = yield* Client.make("");
      const queue = yield* RecipeUploadQueue.Service;
      yield* submit;
      yield* queue.take(Worker.process);
      const {
        data: [imported],
      } = yield* client.recipes.list();
      const recipeId = Option.getOrThrow(Option.fromNullishOr(imported?.id));
      const path = `/recipes/${recipeId}/image`;
      const put = (form: FormData, to = path) =>
        HttpClient.put(to, { body: HttpBody.formData(form) });
      const served = Effect.gen(function* () {
        const response = yield* HttpClient.get(path);
        return [response.status, response.headers["content-type"], yield* response.arrayBuffer];
      });
      const importedFiles = yield* storedFiles;

      // A sent photo replaces the imported one, whatever its declared type.
      const replaced = yield* put(photoForm(new File([jpeg], "photo.png", { type: "image/png" })));
      expect([replaced.status, yield* replaced.text]).toEqual([204, ""]);
      const before = yield* Effect.all([served, storedFiles]);
      expect(before[0]).toEqual([200, "image/jpeg", jpeg.buffer]);
      expect(before[1]).toHaveLength(1);
      expect(before[1]).not.toEqual(importedFiles);
      const { data: withPhoto } = yield* client.recipes.get({ params: { recipeId } });
      expect(withPhoto.hasImage).toBe(true);
      expect(withPhoto.updatedAt).not.toBe(imported?.updatedAt);

      // A later import of the page links the recipe and keeps the sent photo.
      const later = yield* submitSource(samePage);
      yield* queue.take(Worker.process);
      expect((yield* statusOf(later.id)).recipeId).toBe(recipeId);
      expect(yield* Effect.all([served, storedFiles])).toEqual(before);

      // Rejected uploads keep the photo and its file.
      const twoParts = photoForm(new File([png], "a.png"));
      twoParts.append("file", new File([png], "b.png"));
      for (const [status, form] of [
        [400, photoForm(new File(["not an image"], "photo.png", { type: "image/png" }))],
        [400, photoForm(new File([png], "photo.png"), "photo")],
        [413, twoParts],
        [413, photoForm(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "photo.png"))],
      ] as const) {
        const response = yield* put(form);
        expect(response.status).toBe(status);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        if (status === 413) {
          expect(yield* response.json).toEqual({
            type: "goho:problem:upload-limit-exceeded",
            status: 413,
            title: "Upload limit exceeded",
            detail:
              "Upload exceeds a multipart limit. Send one image up to 20 MB with a total request up to 21 MB.",
          });
        }
      }
      expect(yield* Effect.all([served, storedFiles])).toEqual(before);

      // Removing the photo is repeatable and leaves the recipe.
      for (let attempt = 0; attempt < 2; attempt++) {
        const removed = yield* HttpClient.del(path);
        expect([removed.status, yield* removed.text]).toEqual([204, ""]);
      }
      expect((yield* served)[0]).toBe(404);
      expect(yield* storedFiles).toEqual([]);
      const { data: withoutPhoto } = yield* client.recipes.get({ params: { recipeId } });
      expect(withoutPhoto.hasImage).toBe(false);

      // A recipe without a photo gets 201, and the typed client takes both empty successes.
      const created = yield* put(photoForm(new File([png], "photo.png")));
      expect([created.status, yield* created.text]).toEqual([201, ""]);
      const form = photoForm(new File([jpeg], "photo.jpg"));
      expect(
        yield* client.recipes.putImage({ params: { recipeId }, payload: form }),
      ).toBeUndefined();
      expect((yield* served).slice(0, 2)).toEqual([200, "image/jpeg"]);
      expect(yield* storedFiles).toHaveLength(1);

      // A missing recipe gets 404, and its upload leaves no file.
      const files = yield* storedFiles;
      const missing = RecipeId.make("9223372036854775807");
      const notFound = {
        type: "goho:problem:recipe-not-found",
        status: 404,
        title: "Recipe not found",
      };
      for (const response of [
        yield* put(photoForm(new File([png], "photo.png")), `/recipes/${missing}/image`),
        yield* HttpClient.del(`/recipes/${missing}/image`),
      ]) {
        expect([response.status, yield* response.json]).toEqual([404, notFound]);
      }
      expect(yield* storedFiles).toEqual(files);

      // Deleting the recipe still takes its current photo.
      expect((yield* HttpClient.del(`/recipes/${recipeId}`)).status).toBe(204);
      expect(yield* storedFiles).toEqual([]);
    }).pipe(Effect.provide(HttpLive)),
  20_000,
);
