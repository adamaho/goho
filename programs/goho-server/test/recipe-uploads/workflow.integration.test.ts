import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Ai, Postgres } from "@goho/core";
import { RecipeUploadId } from "@goho/goho-api/recipe-uploads";
import { RecipeUrl } from "@goho/goho-api/recipes";
import { Config, Context, Effect, FileSystem, Layer, Option, Redacted, Ref, Result } from "effect";
import { SecureRandom } from "effect/crypto";
import { PersistedQueue } from "effect/persistence";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vitest";

import * as Migrations from "#src/database/migrations.ts";
import * as Transaction from "#src/database/transaction.ts";
import * as QueueConstants from "#src/queues/constants.ts";
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
  request.url === source.url
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
          Ref.get(fakes.failPut).pipe(
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

const submit = RecipeUploads.Service.use((uploads) => uploads.create(source));

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

const statusOf = (uploadId: RecipeUploadId) =>
  RecipeUploads.Service.use((uploads) => uploads.get(uploadId)).pipe(
    Effect.map(({ status, failureCode, recipeId }) => ({ status, failureCode, recipeId })),
  );

it.effect("queues one job per new page and reuses the import of a submitted URL", () =>
  Effect.gen(function* () {
    const first = yield* submit;
    expect(first).toMatchObject({ created: true, upload: { source, status: "queued" } });

    // Another fragment is the same page: the first import and source come back, with no job.
    const again = yield* RecipeUploads.Service.use((uploads) =>
      uploads.create({ kind: "url", url: RecipeUrl.make(pageUrl) }),
    );
    expect(again).toEqual({ created: false, upload: first.upload });
    expect(yield* jobStates).toEqual([{ id: first.upload.id, state: "pending" }]);

    // A failed import still holds its URL until it is deleted.
    yield* RecipeUploadRepository.Service.use((repo) =>
      repo.markFailed(first.upload.id, "no_recipe_found"),
    );
    expect((yield* submit).created).toBe(false);
    expect(yield* jobStates).toHaveLength(1);
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
    const { upload } = yield* submit;

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
    const { upload } = yield* submit;
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
      const { upload } = yield* submit;
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
    const { upload } = yield* submit;
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
    const { upload } = yield* submit;
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
    const { upload } = yield* submit;
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
    const { upload: abandoned } = yield* submit;
    yield* repo.markProcessing(abandoned.id);
    yield* sql`
      UPDATE ${sql(QueueConstants.tableName)} SET state = 'failed'
      WHERE queue_name = ${RecipeUploadQueue.name} AND id = ${abandoned.id}
    `;
    // Only a book job with this ID failed; the import has no failed recipe job.
    const unrelated = RecipeUploadId.make("00000000-0000-4000-8000-000000000001");
    yield* repo.findOrCreateQueued(unrelated, {
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

it.effect("saves a recipe directly without an import, job or source", () =>
  Effect.gen(function* () {
    const recipes = yield* Recipes.Service;
    const { yield: _, ...request } = toast;

    const saved = yield* recipes.create(request);

    expect(saved).toMatchObject({ title: "Toast", source: null, hasImage: false, yield: null });
    expect(yield* recipes.get(saved.id)).toEqual(saved);
    expect((yield* recipes.list).map(({ id }) => id)).toEqual([saved.id]);
    expect(yield* RecipeUploadRepository.Service.use((repo) => repo.list)).toEqual([]);
    expect(yield* jobStates).toEqual([]);
    expect(yield* Fakes.use((fakes) => Ref.get(fakes.modelCalls))).toBe(0);
    expect(yield* failureTag(recipes.getImage(saved.id))).toBe("RecipeImageNotFound");
  }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes an imported recipe with its import and photo, freeing the URL", () =>
  Effect.gen(function* () {
    const recipes = yield* Recipes.Service;
    const { upload } = yield* submit;
    yield* attempt(upload.id);
    const recipeId = Option.getOrThrow(Option.fromNullishOr((yield* statusOf(upload.id)).recipeId));
    expect(yield* storedFiles).toHaveLength(1);

    yield* recipes.delete(recipeId);

    expect(yield* storedFiles).toEqual([]);
    expect(yield* failureTag(recipes.get(recipeId))).toBe("RecipeNotFound");
    expect(yield* failureTag(recipes.getImage(recipeId))).toBe("RecipeImageNotFound");
    expect(yield* failureTag(recipes.delete(recipeId))).toBe("RecipeNotFound");
    expect(yield* failureTag(statusOf(upload.id))).toBe("RecipeUploadNotFound");
    expect((yield* submit).created).toBe(true);
  }).pipe(Effect.provide(TestLive)),
);

it.effect("deletes only a failed import, freeing its URL", () =>
  Effect.gen(function* () {
    const uploads = yield* RecipeUploads.Service;
    const repo = yield* RecipeUploadRepository.Service;
    const { upload } = yield* submit;

    expect(yield* failureTag(uploads.delete(upload.id))).toBe("RecipeUploadConflict");
    yield* repo.markFailed(upload.id, "page_unavailable");
    yield* uploads.delete(upload.id);

    expect(yield* failureTag(uploads.get(upload.id))).toBe("RecipeUploadNotFound");
    expect(yield* failureTag(uploads.delete(upload.id))).toBe("RecipeUploadNotFound");
    expect((yield* submit).created).toBe(true);
  }).pipe(Effect.provide(TestLive)),
);
